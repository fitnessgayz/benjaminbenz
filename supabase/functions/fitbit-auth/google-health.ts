// Google Health v4 exercise import. Keep provider data out of error messages.
export const GOOGLE_HEALTH_SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
export const GOOGLE_HEALTH_API = "https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints";

export class HealthError extends Error {
  code: string;
  status: number;
  reconnect: boolean;
  constructor(message: string, code = "HEALTH_UNAVAILABLE", status = 502, reconnect = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.reconnect = reconnect;
  }
}

export function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function hasReadScope(scope: unknown): boolean {
  return textValue(scope).split(/\s+/).includes(GOOGLE_HEALTH_SCOPE);
}

function optionalNumber(value: unknown, maximum: number, minimum = 0): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function duration(value: unknown, signed = false): number | null {
  const match = textValue(value).match(signed ? /^(-?\d+(?:\.\d{1,9})?)s$/ : /^(\d+(?:\.\d{1,9})?)s$/);
  return match ? Number(match[1]) : null;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger) || year < 2000 || year > 2200) return null;
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function normalizeGoogleExercise(value: unknown): Record<string, unknown> {
  const point = objectValue(value);
  const sourceName = textValue(point.name);
  const exercise = objectValue(point.exercise);
  const interval = objectValue(exercise.interval);
  const start = Date.parse(textValue(interval.startTime));
  const end = Date.parse(textValue(interval.endTime));
  if (!/^users\/(?!me\/)[A-Za-z0-9_-]+\/dataTypes\/exercise\/dataPoints\/[A-Za-z0-9_.:-]+$/.test(sourceName)
    || sourceName.length > 512 || !Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 604800000) {
    throw new HealthError("Google Health returned an invalid workout. No workouts were changed.", "INVALID_WORKOUT");
  }
  const civil = objectValue(objectValue(interval.civilStartTime).date);
  let workoutDate = isoDate(Number(civil.year), Number(civil.month), Number(civil.day));
  if (!workoutDate) {
    const offset = duration(interval.startUtcOffset, true);
    if (offset === null || Math.abs(offset) > 64800) {
      throw new HealthError("Google Health returned a workout without its local date. No workouts were changed.", "INVALID_WORKOUT_DATE");
    }
    workoutDate = new Date(start + offset * 1000).toISOString().slice(0, 10);
  }
  const metrics = objectValue(exercise.metricsSummary);
  const elapsed = Math.round((end - start) / 1000);
  const active = duration(exercise.activeDuration);
  const type = textValue(exercise.displayName) || textValue(exercise.exerciseType).replaceAll("_", " ") || "Workout";
  return {
    source_name: sourceName,
    workout_date: workoutDate,
    activity_type: type.slice(0, 160),
    started_at: new Date(start).toISOString(),
    ended_at: new Date(end).toISOString(),
    duration_seconds: active !== null && active <= elapsed && active <= 604800 ? Math.round(active) : null,
    elapsed_seconds: elapsed,
    // Google reports total exercise calories, not Apple-style active energy.
    calories: optionalNumber(metrics.caloriesKcal, 100000),
    distance_meters: optionalNumber(metrics.distanceMillimeters, 1000000000) === null ? null : Number(metrics.distanceMillimeters) / 1000,
    average_heart_rate: optionalNumber(metrics.averageHeartRateBeatsPerMinute, 300, 20)
  };
}

export function syncWindow(now = new Date()): { startDate: string; endDate: string } {
  // Civil dates have no zone. Two days above UTC cover every user's current
  // local date; history remains bounded to the preceding 30 UTC dates.
  return {
    startDate: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10),
    endDate: new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10)
  };
}

export async function fetchGoogleWorkouts(
  requestPage: (url: string) => Promise<Response>,
  window: { startDate: string; endDate: string },
  ownClientId = "",
  deadline = Date.now() + 55000
): Promise<Record<string, unknown>[]> {
  const records = new Map<string, Record<string, unknown>>();
  const seenTokens = new Set<string>();
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    if (Date.now() > deadline) throw new HealthError("Google Health sync took too long. Please retry.", "SYNC_TIMEOUT", 504);
    const url = new URL(GOOGLE_HEALTH_API);
    url.searchParams.set("filter", `exercise.interval.civil_start_time >= "${window.startDate}" AND exercise.interval.civil_start_time < "${window.endDate}"`);
    url.searchParams.set("pageSize", "25");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await requestPage(url.toString());
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new HealthError("Reconnect Google Health to allow workout access.", "RECONNECT_REQUIRED", 409, true);
      if (response.status === 429) throw new HealthError("Google Health is busy. Sync will retry later.", "PROVIDER_RATE_LIMIT", 429);
      throw new HealthError("Google Health could not load your workouts. Sync will retry later.");
    }
    let raw: unknown;
    try { raw = await response.json(); } catch (_) { throw new HealthError("Google Health returned an unreadable response. Please retry."); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HealthError("Google Health returned an invalid workout list.");
    const payload = objectValue(raw);
    if ("error" in payload || (payload.nextPageToken !== undefined && typeof payload.nextPageToken !== "string")) throw new HealthError("Google Health returned an incomplete workout list.");
    if (payload.dataPoints !== undefined && !Array.isArray(payload.dataPoints)) throw new HealthError("Google Health returned an invalid workout list.");
    for (const value of (payload.dataPoints || []) as unknown[]) {
      const point = objectValue(value);
      // Historical exports from this app must not reappear as a new workout.
      if (ownClientId && textValue(objectValue(objectValue(point.dataSource).application).googleWebClientId) === ownClientId) continue;
      const workout = normalizeGoogleExercise(point);
      if (String(workout.workout_date) < window.startDate || String(workout.workout_date) >= window.endDate) continue;
      records.set(String(workout.source_name), workout);
    }
    pageToken = textValue(payload.nextPageToken);
    if (!pageToken) return Array.from(records.values());
    if (seenTokens.has(pageToken)) throw new HealthError("Google Health pagination did not complete. No workouts were changed.", "INCOMPLETE_SYNC");
    seenTokens.add(pageToken);
  }
  throw new HealthError("Google Health returned too many workouts for one sync. No workouts were changed.", "INCOMPLETE_SYNC");
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index++) difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return difference === 0;
}
