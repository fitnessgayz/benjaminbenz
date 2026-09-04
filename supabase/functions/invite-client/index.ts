import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { coachEmails, corsHeaders, isAllowedOrigin, jsonResponse, normalizeEmail, stringValue, validEmail } from "../_shared/http.ts";

function safeRedirectTo(value: unknown) {
  if (typeof value !== "string") {
    return "https://benjaminbenz.com/client-invite.html";
  }

  try {
    const url = new URL(value);

    if (!isAllowedOrigin(url.origin) || url.pathname !== "/client-invite.html") {
      return "https://benjaminbenz.com/client-invite.html";
    }

    return url.toString();
  } catch {
    return "https://benjaminbenz.com/client-invite.html";
  }
}

function manualInviteUrl(data: unknown) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const properties = "properties" in data ? data.properties : undefined;

  if (!properties || typeof properties !== "object") {
    return "";
  }

  const actionLink = "action_link" in properties ? properties.action_link : undefined;

  return typeof actionLink === "string" ? actionLink : "";
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(request, { error: "Invite function is missing Supabase secrets." }, 500);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(request, { error: "Sign in as coach first." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const callerEmail = userData.user?.email?.toLowerCase();

  if (userError || !callerEmail) {
    return jsonResponse(request, { error: "Could not verify coach login." }, 401);
  }

  if (!coachEmails().includes(callerEmail)) {
    return jsonResponse(request, { error: "This login is not set up as a coach admin." }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const safeBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const email = normalizeEmail(safeBody.email || safeBody.client_email);
  const clientName = stringValue(safeBody.clientName || safeBody.client_name);
  const redirectTo = safeRedirectTo(safeBody.redirectTo);

  if (!validEmail(email)) {
    return jsonResponse(request, { error: "Add a valid client email." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
  const inviteOptions = {
    redirectTo,
    data: {
      email,
      client_email: email,
      client_name: clientName
    }
  };
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (inviteError) {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email,
      options: inviteOptions
    });
    const actionLink = linkError ? "" : manualInviteUrl(linkData);

    return jsonResponse(request, {
      error: inviteError.message || "Supabase could not send the invite email. Check Auth email logs and SMTP settings.",
      manualInviteUrl: actionLink || undefined
    }, 400);
  }

  const invitedEmail = normalizeEmail(inviteData?.user?.email);

  if (invitedEmail && invitedEmail !== email) {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email,
      options: inviteOptions
    });
    const actionLink = linkError ? "" : manualInviteUrl(linkData);

    return jsonResponse(request, {
      error: `Supabase returned ${invitedEmail} instead of ${email}. Invite email was not trusted.`,
      manualInviteUrl: actionLink || undefined
    }, 502);
  }

  if (!invitedEmail) {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email,
      options: inviteOptions
    });
    const actionLink = linkError ? "" : manualInviteUrl(linkData);

    return jsonResponse(request, {
      error: "Supabase accepted the invite request but did not confirm the invited email.",
      manualInviteUrl: actionLink || undefined
    }, 502);
  }

  return jsonResponse(request, { message: `Invite sent to ${invitedEmail}.`, email: invitedEmail });
});
