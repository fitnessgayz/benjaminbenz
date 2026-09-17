import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import ICAL from "npm:ical.js@2.2.1";

const productionOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com"
]);
const defaultCoachEmail = "benjaminbenz.fit@gmail.com";
const maxCalendarBytes = 5 * 1024 * 1024;
const maxCalendarEvents = 500;
const maxRangeDays = 184;

function allowedOrigin(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";

  try {
    const url = new URL(origin);
    if (productionOrigins.has(origin) || url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return origin;
    }
  } catch {
    // Fall back to the production origin.
  }

  return "https://benjaminbenz.com";
}

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store"
    }
  });
}

function coachEmails() {
  return (Deno.env.get("COACH_ADMIN_EMAILS") || defaultCoachEmail)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function calendarFeedUrl() {
  const value = Deno.env.get("FWB_CALENDAR_ICAL_URL") || "";

  try {
    const url = new URL(value);
    const isGoogleFeed = url.protocol === "https:" &&
      url.hostname === "calendar.google.com" &&
      url.pathname.startsWith("/calendar/ical/") &&
      url.pathname.endsWith("/basic.ics") &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443");

    return isGoogleFeed ? url : null;
  } catch {
    return null;
  }
}

function safeDate(value: unknown, fallback: Date) {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function requestedRange(input: Record<string, unknown>, now = new Date()) {
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 35);
  const defaultTo = new Date(now);
  defaultTo.setUTCDate(defaultTo.getUTCDate() + 95);
  const from = safeDate(input.from, defaultFrom);
  const requestedTo = safeDate(input.to, defaultTo);
  const maxTo = new Date(from.getTime() + maxRangeDays * 86400000);
  const to = requestedTo > from && requestedTo <= maxTo ? requestedTo : maxTo;

  return { from, to };
}

function textValue(value: unknown, maxLength = 140) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isCanceledEvent(summary: string, status: unknown) {
  return String(status || "").toUpperCase() === "CANCELLED" || /\bcancell?ed\b/i.test(summary);
}

function calendarEventRecord(event: any, startDate: any, endDate: any) {
  const title = textValue(event.summary || "Training session");
  const start = startDate.toJSDate();
  const end = endDate.toJSDate();
  const status = event.component.getFirstPropertyValue("status");

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return {
    id: `${textValue(event.uid, 180)}:${start.toISOString()}`,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    all_day: Boolean(startDate.isDate),
    canceled: isCanceledEvent(title, status)
  };
}

export function parseCalendarEvents(icsText: string, from: Date, to: Date) {
  const calendar = new ICAL.Component(ICAL.parse(icsText));
  const components = calendar.getAllSubcomponents("vevent");
  const masters = new Map<string, any>();
  const exceptions = new Map<string, any[]>();

  components.forEach((component: any) => {
    const event = new ICAL.Event(component);
    const recurrenceId = component.getFirstPropertyValue("recurrence-id");

    if (recurrenceId) {
      const items = exceptions.get(event.uid) || [];
      items.push(event);
      exceptions.set(event.uid, items);
    } else {
      masters.set(event.uid, event);
    }
  });

  exceptions.forEach((items, uid) => {
    const master = masters.get(uid);
    items.forEach((event) => master?.relateException(event));
  });

  const records: Record<string, unknown>[] = [];

  masters.forEach((event) => {
    if (event.isRecurring()) {
      // ical.js recurrence expansion must begin at DTSTART so COUNT, EXDATE,
      // RDATE, and recurrence exceptions remain accurate. Older occurrences
      // are skipped after expansion instead of moving the iterator's base.
      const iterator = event.iterator();
      let next = iterator.next();
      let safety = 0;

      while (next && safety < 10000) {
        const details = event.getOccurrenceDetails(next);
        const start = details.startDate.toJSDate();

        if (start >= to) break;
        if (start >= from) {
          const record = calendarEventRecord(details.item, details.startDate, details.endDate);
          if (record) records.push(record);
        }

        next = iterator.next();
        safety += 1;
      }
      return;
    }

    const start = event.startDate.toJSDate();
    if (start >= from && start < to) {
      const record = calendarEventRecord(event, event.startDate, event.endDate);
      if (record) records.push(record);
    }
  });

  return records
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .slice(0, maxCalendarEvents);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authHeader = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey || !authHeader.startsWith("Bearer ")) {
    return jsonResponse(request, { error: "Sign in as coach first." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } }
  });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const callerEmail = userData.user?.email?.trim().toLowerCase() || "";

  if (userError || !callerEmail) {
    return jsonResponse(request, { error: "Could not verify coach login." }, 401);
  }

  if (!coachEmails().includes(callerEmail)) {
    return jsonResponse(request, { error: "This login is not set up as a coach admin." }, 403);
  }

  const feedUrl = calendarFeedUrl();
  if (!feedUrl) {
    return jsonResponse(request, { error: "FWB Calendar sync is not configured." }, 503);
  }

  const input = await request.json().catch(() => ({}));
  const safeInput = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const { from, to } = requestedRange(safeInput);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(feedUrl, {
      headers: { "Accept": "text/calendar" },
      redirect: "error",
      signal: controller.signal
    });

    if (!response.ok) {
      return jsonResponse(request, { error: "FWB Calendar could not be loaded." }, 502);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxCalendarBytes) {
      return jsonResponse(request, { error: "FWB Calendar response was too large." }, 502);
    }

    const icsText = await response.text();
    if (new TextEncoder().encode(icsText).byteLength > maxCalendarBytes) {
      return jsonResponse(request, { error: "FWB Calendar response was too large." }, 502);
    }

    const events = parseCalendarEvents(icsText, from, to);
    return jsonResponse(request, {
      calendar: "FWB Calendar",
      time_zone: "America/Los_Angeles",
      synced_at: new Date().toISOString(),
      events
    });
  } catch {
    return jsonResponse(request, { error: "FWB Calendar could not be loaded." }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
});
