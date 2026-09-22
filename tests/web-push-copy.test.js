const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

function helpers(file, names) {
  const source = fs.readFileSync(path.join(__dirname, "../supabase/functions", file, "index.ts"), "utf8");
  const declarations = names.map((name) => {
    const match = new RegExp(`(?:export )?(?:async )?function ${name}\\(`).exec(source);
    assert.ok(match, `${name} must exist in ${file}`);
    const tail = source.slice(match.index);
    const next = tail.slice(1).search(/\n(?:export )?(?:async )?function /);
    return (next < 0 ? tail : tail.slice(0, next + 1)).replace(/^export /, "");
  });
  return vm.runInNewContext(`${stripTypeScriptTypes(declarations.join("\n"))}\n({${names.join(",")}})`);
}

const modern = helpers("send-web-push", ["pushCopy"]);
const compatibility = helpers("fwb-web-push", ["safeNotificationText", "safePushTitle", "safePushBody"]);
const privateReviewBody = "Open Coach Admin to review the private check-in.";
const privateBody = "PRIVATE: mood 1/5, sleep 2/5, pain details and a personal client note";

function copies(notification) {
  const modernCopy = modern.pushCopy({ recipient_role: "coach", kind: "check_in_submitted", ...notification });
  return [
    { title: modernCopy.title, body: modernCopy.body },
    {
      title: compatibility.safePushTitle("check_in_submitted", notification),
      body: compatibility.safePushBody("check_in_submitted", notification)
    }
  ];
}

test("both push backends preserve client names and check-in types while excluding private check-in content", () => {
  for (const title of [
    "Zoë O’Neil completed a mood check-in",
    "Alex checked in at the gym",
    "Sam submitted a weekly check-in"
  ]) {
    const notification = Object.freeze({ title, body: privateBody });
    for (const copy of copies(notification)) {
      assert.deepEqual(copy, { title, body: privateReviewBody });
      assert.doesNotMatch(JSON.stringify(copy), /PRIVATE|1\/5|pain details|personal client note/);
    }
    assert.equal(notification.body, privateBody);
  }
});

test("both check-in title helpers normalize whitespace and enforce the existing 160-character bound", () => {
  for (const copy of copies({ title: " \n Alex\t  Green \r\n completed a mood check-in  ", body: privateBody })) {
    assert.equal(copy.title, "Alex Green completed a mood check-in");
    assert.equal(copy.body, privateReviewBody);
  }
  for (const copy of copies({ title: ` \n${"A".repeat(190)}\tcompleted a mood check-in `, body: privateBody.repeat(20) })) {
    assert.equal(copy.title, "A".repeat(160));
    assert.equal(copy.title.length, 160);
    assert.equal(copy.body, privateReviewBody);
  }
});

test("missing check-in titles use generic fallback copy without falling back to a private body", () => {
  for (const title of [undefined, null, "", " \n\t "]) {
    for (const copy of copies({ title, body: privateBody })) {
      assert.deepEqual(copy, { title: "Client check-in submitted", body: privateReviewBody });
    }
  }
});

test("modern personalization is restricted to coach check-in recipients", () => {
  for (const recipient_role of ["client", undefined, "other"]) {
    const copy = modern.pushCopy({ recipient_role, kind: "check_in_submitted", title: "PRIVATE named title", body: privateBody });
    assert.equal(copy.title, "New FWB notification");
    assert.equal(copy.body, "Open FWB to view this update.");
  }
});

test("all other private notification categories keep their generic delivery copy", () => {
  const notification = { title: "PRIVATE named title", body: privateBody };
  for (const [recipient_role, kinds] of [
    ["coach", ["progress_submitted", "dexa_uploaded", "questionnaire_submitted", "coach_request", "workout_comment", "form_check_submitted", "nutrition_activity", "session_balance", "client_inactive"]],
    ["client", ["coach_reply", "program_update", "nutrition_plan_update", "session_reminder", "workout_reminder", "weekly_check_in", "monthly_report", "session_balance", "nutrition_reminder", "progress_reminder", "achievement", "workout_comment", "form_check_feedback"]]
  ]) {
    for (const kind of kinds) {
      const copy = modern.pushCopy({ ...notification, recipient_role, kind });
      assert.doesNotMatch(`${copy.title} ${copy.body}`, /PRIVATE|1\/5|pain details|personal client note/, `${recipient_role}:${kind}`);
    }
  }
  for (const category of ["client_message", "low_sessions", "inactivity", "coach_reply", "program_update", "workout_reminder", "weekly_check_in", "general", "unknown"]) {
    assert.doesNotMatch(compatibility.safePushTitle(category, notification), /PRIVATE/);
    assert.equal(compatibility.safePushBody(category, notification), "Open FWB to view your update.");
  }
});

test("previous workout personalization and its title/body bounds remain unchanged", () => {
  const notification = { title: " \nAlex completed a workout\t", body: "  Upper body\n is ready to review. " };
  const copy = modern.pushCopy({ ...notification, recipient_role: "coach", kind: "workout_completed" });
  assert.equal(copy.title, "Alex completed a workout");
  assert.equal(copy.body, "Upper body is ready to review.");
  assert.equal(compatibility.safePushTitle("workout_completed", notification), copy.title);
  assert.equal(compatibility.safePushBody("workout_completed", notification), copy.body);
  const long = { title: "A".repeat(200), body: "B".repeat(300) };
  const bounded = modern.pushCopy({ ...long, recipient_role: "coach", kind: "workout_completed" });
  assert.equal(bounded.title.length, 160);
  assert.equal(bounded.body.length, 240);
  assert.equal(compatibility.safePushTitle("workout_completed", long).length, 160);
  assert.equal(compatibility.safePushBody("workout_completed", long).length, 240);
});
