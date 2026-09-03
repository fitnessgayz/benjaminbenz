// Shared CORS, response, and input-parsing helpers for Supabase edge functions.
// Local dev is allowed on any localhost/127.0.0.1 port so per-function port
// allowlists don't need to be kept in sync with whatever dev server is running.
export const PRODUCTION_ORIGINS = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com"
]);

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string): boolean {
  return PRODUCTION_ORIGINS.has(origin) || isLocalDevOrigin(origin);
}

export function allowedOriginFor(request: Request): string {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";
  return isAllowedOrigin(origin) ? origin : "https://benjaminbenz.com";
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOriginFor(request),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

export function jsonResponse(request: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value: unknown): string {
  return stringValue(value).toLowerCase();
}

export function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function emailList(value: string): string[] {
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export function coachEmails(): string[] {
  return emailList(Deno.env.get("COACH_ADMIN_EMAILS") || "benjaminbenz.fit@gmail.com")
    .map((email) => email.toLowerCase());
}
