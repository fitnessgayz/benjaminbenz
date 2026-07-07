import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com",
  "http://127.0.0.1:4177",
  "http://localhost:4177",
  "http://127.0.0.1:4191",
  "http://localhost:4191",
  "http://127.0.0.1:4192",
  "http://localhost:4192"
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "https://benjaminbenz.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function emailList(value: string) {
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("PASSWORD_NOTIFICATION_FROM") || "";
  const notifyEmails = emailList(
    Deno.env.get("PASSWORD_NOTIFICATION_EMAILS") ||
    Deno.env.get("COACH_ADMIN_EMAILS") ||
    "benjaminbenz.fit@gmail.com"
  );
  const authHeader = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey) {
    return jsonResponse(request, { error: "Notification function is missing Supabase secrets." }, 500);
  }

  if (!resendApiKey || !fromEmail || notifyEmails.length === 0) {
    return jsonResponse(request, { error: "Notification email is not configured." }, 500);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(request, { error: "Client login required." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await userClient.auth.getUser();
  const clientEmail = data.user?.email || "";

  if (error || !clientEmail) {
    return jsonResponse(request, { error: "Could not verify client login." }, 401);
  }

  const createdAt = new Date().toISOString();
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: notifyEmails,
      subject: "Client portal password created",
      text: [
        "A client created their Fitness with Benjamin portal username and password.",
        "",
        `Client email: ${clientEmail}`,
        `Completed at: ${createdAt}`,
        "",
        "No password is included or stored in this notification."
      ].join("\n")
    })
  });

  if (!resendResponse.ok) {
    const message = await resendResponse.text().catch(() => "");

    return jsonResponse(request, {
      error: "Could not send notification email.",
      detail: message || undefined
    }, 502);
  }

  return jsonResponse(request, { message: "Notification sent.", email: clientEmail });
});
