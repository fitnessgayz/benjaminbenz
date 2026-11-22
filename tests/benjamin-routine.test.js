const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const catalog = require("../js/benjamin-routine");
const progression = require("../js/workout-progression");

// Native continuity identifiers and checked-in iOS cover Git blob IDs.
const ids = {
  "full-body": "7eb967ae856079e1455735d53f50d0cefba62550",
  "chest-triceps": "4410c0fa1df52c3690c5f8debaacbb8c78f4e48c",
  "back-biceps": "5c711416d19c2c917ef22d85d78d8c1790f996fa",
  "push-day": "16bb61510ed36b32d9b986cc26d35256d6472ebf",
  "pull-day": "3d999d06082ba5b7e09cf1cdebb9af158ea8c654",
  glutes: "27ff1140322ee002f12caf658458648178cc626c",
  "lower-body": "a5888d3d9f1fcede45781a8261164d454e35d595"
};

test("the collection has the same two ordered seven-session catalogs, template IDs, and covers as iOS", () => {
  for (const level of ["Intermediate", "Advanced"]) {
    const sessions = catalog.sessions.filter(item => item.level === level);
    assert.deepEqual(sessions.map(item => item.slug), Object.keys(ids));
    for (const item of sessions) {
      const id = createHash("sha256").update("fwb-explore-routine-v1|benjamin-" + item.slug + (level === "Advanced" ? "-advanced" : "")).digest().subarray(0, 16);
      id[6] = (id[6] & 15) | 80;
      id[8] = (id[8] & 63) | 128;
      assert.equal(item.id.replaceAll("-", ""), id.toString("hex"));
      assert.equal(catalog.find(item.id), item);
      const image = fs.readFileSync(path.join(__dirname, "..", item.cover));
      assert.equal(createHash("sha1").update("blob " + image.length + "\0").update(image).digest("hex"), ids[item.slug]);
    }
  }
});

test("native level-specific sets and rep ranges feed the same standard web progression, with no invented warmups or timed rounds", () => {
  const expectedSets = [[3,3,3,3,3],[3,3,2,2,2],[3,3,3,2,2],[3,3,3,3,3],[3,3,3,3,2],[4,3,3,3],[3,3,3,3,3]];
  const expectedReps = [["8-12","8-12","8-12","8-12","8-12"],["8-12","8-12","12-15","10-15","10-15"],["8-12","8-12","8-12","10-15","10-15"],["8-12","8-12","12-15","12-15","10-15"],["8-12","8-12","10-15","12-15","12-15"],["8-12","12-15","12-15","10-15"],["10-15","8-12","8-12","8-12","10-15"]];
  catalog.sessions.forEach((session, slot) => {
    assert.equal(session.format, "single");
    assert.equal(session.warmUpCount, 0);
    const template = slot % 7, advanced = slot >= 7;
    assert.equal(session.exercises.length, expectedSets[template].length);
    session.exercises.forEach((exercise, index) => {
      const sets = Math.min(4, expectedSets[template][index] + (advanced && index < 2 ? 1 : 0));
      const reps = advanced && index === 0 && template !== 6 ? "6-8" : expectedReps[template][index];
      assert.equal(exercise.prescription, reps + " reps x " + sets + " sets");
      assert.equal(exercise.rest, undefined);
      assert.equal(exercise.progression, undefined);
      const targets = progression.deriveConfig(exercise, sets);
      assert.equal(targets.planned_sets, sets);
      assert.equal(targets.rep_min, Number(reps.split("-")[0]));
      assert.equal(targets.rep_max, Number(reps.split("-")[1]));
    });
  });
});

test("Explore at-home catalog uses native identities, difficulty, equipment, rest and art", () => {
  assert.deepEqual(catalog.atHome.map(item=>[item.title,item.level,item.focus]),[
    ["Full Body Foundations","Beginner","Bodyweight"], ["Lower Body & Core","Intermediate","Bodyweight"],
    ["Upper Body Strength","Intermediate","Dumbbells"], ["Full Body Strength","Advanced","Dumbbells"]
  ]);
  assert.deepEqual(catalog.atHome.map(item=>item.exercises.length),[4,5,5,6]);
  assert.deepEqual(catalog.atHome.flatMap(item=>item.exercises.filter(x=>x.timed).map(x=>x.name)),["Side Plank","Front Plank"]);
  assert.equal(new Set(catalog.atHome.map(item=>item.cover)).size,4);
  for (const [index,item] of catalog.atHome.entries()) {
    const id = createHash("sha256").update("fwb-explore-at-home-v1|" + item.slug).digest().subarray(0, 16);
    id[6] = (id[6] & 15) | 80; id[8] = (id[8] & 63) | 128;
    assert.equal(item.id.replaceAll("-", ""),id.toString("hex"));
    assert.equal(catalog.find(item.id),item);
    assert.ok(fs.readFileSync(path.join(__dirname,"..",item.cover)).subarray(0,2).equals(Buffer.from([0xff,0xd8])));
    assert.ok(item.exercises.every(x=>x.rest===[60,60,75,90][index]+"s rest"));
  }
});
