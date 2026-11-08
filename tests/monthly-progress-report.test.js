const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");

function monthlyReportRuntime() {
  const document = {
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    FWB_SUPABASE_CONFIG: {},
    addEventListener() {},
    location: {
      href: "https://benjaminbenz.com/client-dashboard.html",
      hostname: "benjaminbenz.com",
      origin: "https://benjaminbenz.com",
      pathname: "/client-dashboard.html",
      search: "",
      hash: ""
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    matchMedia() { return { matches: false, addEventListener() {} }; },
    requestAnimationFrame(callback) { callback(); },
    history: { replaceState() {} }
  };
  const sandbox = {
    window,
    document,
    URL,
    URLSearchParams,
    Date,
    Intl,
    console,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    FormData,
    Blob
  };

  vm.createContext(sandbox);
  vm.runInContext(`${source}\nthis.__monthlyReport = buildMonthlyProgressReport;\nthis.__availableMonthlyReport = availableMonthlyProgressReport;\nthis.__setSavedReports = (reports) => { savedMonthlyTrainingReports = reports; };\nthis.__setClient = (program, email) => { currentProgram = program; activeClientEmail = email; };`, sandbox);
  sandbox.__setClient({ client_name: "John Lam" }, "john@example.com");

  const buildReport = sandbox.__monthlyReport;
  buildReport.available = sandbox.__availableMonthlyReport;
  buildReport.setSaved = sandbox.__setSavedReports;
  return buildReport;
}

test("builds a completed-month client report from working sets", () => {
  const buildReport = monthlyReportRuntime();
  const logs = [
    { entry_date: "2026-08-04", workout_title: "Lower A", session_id: "session-1", exercise_code: "HT", exercise_name: "Hip Thrust", set_number: 1, set_type: "working", weight_used: 40, reps: 8 },
    { entry_date: "2026-08-04", workout_title: "Lower A", session_id: "session-1", exercise_code: "HT", exercise_name: "Hip Thrust", set_number: 1001, set_type: "warm_up", weight_used: 20, reps: 10 },
    { entry_date: "2026-08-04", workout_title: "Lower A", session_id: "session-1", exercise_code: "LP", exercise_name: "Leg Press", set_number: 1, set_type: "working", weight_used: 200, reps: 10 },
    { entry_date: "2026-08-18", workout_title: "Lower B", session_id: "session-2", exercise_code: "HT", exercise_name: "Hip Thrust", set_number: 1, set_type: "working", weight_used: 50, reps: 8 },
    { entry_date: "2026-08-18", workout_title: "Lower B", session_id: "session-2", exercise_code: "LP", exercise_name: "Leg Press", set_number: 1, set_type: "working", weight_used: 220, reps: 10 },
    { entry_date: "2026-08-18", workout_title: "Lower B", session_id: "session-2", exercise_code: "CARDIO", exercise_name: "Cardio", set_number: 1, set_type: "working", weight_used: 20, reps: 0 }
  ];
  const report = buildReport(logs, "2026-08");

  assert.equal(report.monthLabel, "August 2026");
  assert.equal(report.clientName, "John Lam");
  assert.equal(report.workouts, 2);
  assert.equal(report.workingSets, 4);
  assert.equal(report.exerciseCount, 2);
  assert.equal(report.activeWeeks, 2);
  assert.equal(report.highlights.length, 2);
  assert.equal(report.highlights[0].type, "Progress");
  assert.match(report.highlights[0].value, /40 lb × 8 → 50 lb × 8/);
});

test("does not publish an in-progress current-month report", () => {
  const buildReport = monthlyReportRuntime();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const report = buildReport([
    { entry_date: `${thisMonth}-03`, workout_title: "Upper", exercise_code: "BP", exercise_name: "Bench Press", set_number: 1, set_type: "working", weight_used: 100, reps: 8 }
  ]);

  assert.equal(report, null);
});

test("shows a generated report even when the active client logged no sets", () => {
  const buildReport = monthlyReportRuntime();
  buildReport.setSaved([{ report_month: "2026-10-01", client_name: "John Lam", workouts: 0,
    working_sets: 0, active_weeks: 0, exercise_count: 0, highlights: [] }]);
  const report = buildReport.available([]);
  assert.equal(report.monthKey, "2026-10");
  assert.equal(report.workouts, 0);
  assert.equal(report.clientName, "John Lam");
  assert.equal(report.focus.length, 3);
});
