import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function emailList(value: string) {
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Use POST." }, 405);
  }

  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";

  if (!allowedOrigins.has(origin)) {
    return jsonResponse(request, { error: "Origin is not allowed." }, 403);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("CONTACT_MESSAGE_FROM") ||
    Deno.env.get("PASSWORD_NOTIFICATION_FROM") ||
    "";
  const notifyEmails = emailList(
    Deno.env.get("CONTACT_MESSAGE_EMAILS") ||
    Deno.env.get("PASSWORD_NOTIFICATION_EMAILS") ||
    Deno.env.get("COACH_ADMIN_EMAILS") ||
    "benjaminbenz.fit@gmail.com"
  );

  if (!resendApiKey || !fromEmail || notifyEmails.length === 0) {
    return jsonResponse(request, { error: "Contact email is not configured." }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const safeBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const honeypot = stringValue(safeBody.website);

  if (honeypot) {
    return jsonResponse(request, { message: "Message sent." });
  }

  const name = stringValue(safeBody.name);
  const email = stringValue(safeBody.email).toLowerCase();
  const phone = stringValue(safeBody.phone);
  const message = stringValue(safeBody.message);

  if (!name || !validEmail(email) || message.length < 8) {
    return jsonResponse(request, { error: "Add your name, a valid email, and a message." }, 400);
  }

  if (name.length > 120 || email.length > 180 || phone.length > 60 || message.length > 2000) {
    return jsonResponse(request, { error: "Message is too long." }, 400);
  }

  const submittedAt = new Date().toISOString();
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: notifyEmails,
      reply_to: email,
      subject: `Website message from ${name}`,
      text: [
        "New message from benjaminbenz.com.",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || "Not provided"}`,
        `Submitted at: ${submittedAt}`,
        "",
        "Message:",
        message
      ].join("\n")
    })
  });

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => "");

    return jsonResponse(request, {
      error: "Could not send message.",
      detail: detail || undefined
    }, 502);
  }

  return jsonResponse(request, { message: "Message sent." });
});
