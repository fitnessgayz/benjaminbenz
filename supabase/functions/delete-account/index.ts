import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const maxStoragePages = 8;

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply(405, { error: "method_not_allowed" });
  }

  const bearer = request.headers.get("authorization")?.match(
    /^Bearer ([^\s]+)$/i,
  );
  if (!bearer) return reply(401, { error: "unauthenticated" });

  const projectURL = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectURL || !serviceRoleKey) {
    return reply(503, { error: "deletion_unavailable" });
  }

  const supabase = createClient(projectURL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Auth, rather than local JWT decoding, confirms the user still exists.
    // The request body never selects which account or objects to delete.
    const { data: { user }, error } = await supabase.auth.getUser(bearer[1]);
    if (error || !user) return reply(401, { error: "unauthenticated" });
    if (!user.email_confirmed_at || user.is_anonymous) {
      return reply(403, { error: "client_account_required" });
    }

    const args = { p_account_id: user.id };
    for (let page = 0; page <= maxStoragePages; page++) {
      // Check the protected client role before Storage deletion, and limit each
      // inventory to a small page so that a timed-out request can be retried.
      const inventory = await supabase.rpc(
        "account_deletion_storage_objects",
        args,
      );
      if (inventory.error?.code === "42501") {
        return reply(403, { error: "client_account_required" });
      }
      if (inventory.error?.code === "23505") {
        return reply(409, { error: "account_ownership_unconfirmed" });
      }
      if (inventory.error || !Array.isArray(inventory.data)) {
        return reply(503, { error: "deletion_unconfirmed" });
      }

      if (inventory.data.length === 0) {
        const finished = await supabase.rpc(
          "finish_client_account_deletion",
          args,
        );
        if (finished.error || typeof finished.data !== "boolean") {
          return reply(503, { error: "deletion_unconfirmed" });
        }
        if (finished.data) return reply(200, { deleted: true });
        continue;
      }

      if (page === maxStoragePages) break;
      const byBucket = new Map<string, string[]>();
      for (const { bucket_id, object_name } of inventory.data) {
        if (
          typeof bucket_id !== "string" || typeof object_name !== "string" ||
          !bucket_id || !object_name
        ) {
          return reply(503, { error: "deletion_unconfirmed" });
        }
        if (!byBucket.has(bucket_id)) byBucket.set(bucket_id, []);
        byBucket.get(bucket_id)!.push(object_name);
      }

      for (const [bucket, names] of byBucket) {
        // SQL never deletes Storage metadata. The Storage API also removes the
        // underlying object. The next iteration checks for leftovers by owner.
        const removal = await supabase.storage.from(bucket).remove(names);
        if (removal.error) return reply(503, { error: "deletion_unconfirmed" });
      }
    }

    return reply(503, { error: "deletion_unconfirmed" });
  } catch {
    // Backend responses can include identity or object paths. Do not log them.
    return reply(503, { error: "deletion_unconfirmed" });
  }
});
