(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FWBCoachWorkoutCorrections = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const emailKey = (value) => String(value || "").trim().toLowerCase();
  let options, records = new Map(), dialog, opened, busy = false;

  function eligible(row) {
    return Boolean(row?.id && row?.updated_at && row?.client_email && !["CARDIO", "WARMUP"].includes(row.exercise_code));
  }
  function weightValue(text) {
    if (String(text ?? "").trim() === "") throw new Error("Enter a weight of zero or more.");
    const weight = Number(text);
    if (!Number.isFinite(weight) || weight < 0) throw new Error("Enter a valid weight of zero or more.");
    return weight;
  }
  async function correctWeight(client, row, text) {
    const weight = weightValue(text);
    if (!eligible(row)) throw new Error("Refresh workout history before correcting this set.");
    const { data, error } = await client.rpc("coach_correct_workout_weight", {
      p_log_id: row.id, p_client_email: emailKey(row.client_email),
      p_weight: weight, p_expected_updated_at: row.updated_at
    });
    if (error) throw new Error(error.message || "Could not save this correction. Try again.");
    if (data !== 1) throw new Error("This set changed. Refresh workout history and try again.");
    return weight;
  }
  async function loadHistory(client, email) {
    const rows = [];
    const escapedEmail = emailKey(email).replace(/[\\%_]/g, "\\$&");
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from("client_workout_logs").select("*")
        .ilike("client_email", escapedEmail)
        .order("entry_date", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + 999);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }
  function setRecords(rows) { records = new Map(rows.filter(eligible).map((row) => [String(row.id), row])); }
  function buttonsForSets(sets) {
    return sets.filter((set) => records.has(String(set.id))).map((set) => {
      const warmup = set.set_type === "warm_up" || (!set.set_type && Number(set.set_number) > 1000);
      const label = warmup ? `Warm-up ${Number(set.set_number) - 1000}` : `Set ${Number(set.set_number) || 1}`;
      return `<button class="button button-ghost coach-weight-correct" type="button" data-coach-correct-weight="${escape(set.id)}" aria-label="Correct ${escape(label)} weight">${escape(label)} · Correct weight</button>`;
    }).join("");
  }
  function createDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "coach-weight-dialog";
    dialog.setAttribute("aria-labelledby", "coach-weight-title");
    dialog.innerHTML = `<form><h2 id="coach-weight-title">Correct workout weight</h2>
      <p data-weight-context></p><p data-weight-original></p>
      <label for="coach-weight-input">Correct weight (lb)</label>
      <input id="coach-weight-input" name="weight" type="number" min="0" step="any" inputmode="decimal" required />
      <p class="coach-weight-help">Updates this saved set. Personal bests and progress will use the corrected weight when refreshed.</p>
      <p data-weight-error role="alert"></p>
      <div class="coach-weight-actions"><button class="button button-ghost" type="button" data-weight-cancel>Cancel</button>
      <button class="button button-dark" type="submit">Save correction</button></div></form>`;
    document.body.append(dialog);
    dialog.querySelector("[data-weight-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || !opened) return;
      const row = opened;
      const errorText = dialog.querySelector("[data-weight-error]");
      errorText.textContent = "";
      busy = true;
      dialog.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
      try {
        await correctWeight(options.client, row, dialog.querySelector("input").value);
        dialog.close();
        if (emailKey(options.getEmail()) === emailKey(row.client_email)) await options.onSaved(row);
      } catch (error) { errorText.textContent = error.message; }
      finally { busy = false; dialog.querySelectorAll("button, input").forEach((control) => { control.disabled = false; }); }
    });
  }
  function configure(settings) {
    options = settings;
    if (dialog) return;
    createDialog();
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-coach-correct-weight]");
      if (!button || busy) return;
      const row = records.get(button.dataset.coachCorrectWeight);
      if (!row || emailKey(row.client_email) !== emailKey(options.getEmail())) return;
      opened = { ...row };
      dialog.querySelector("[data-weight-context]").textContent = `${row.exercise_name} · ${row.entry_date} · ${row.workout_title}`;
      dialog.querySelector("[data-weight-original]").textContent = `Saved: ${row.weight_used ?? "No weight"}${row.weight_used == null ? "" : " lb"} · ${row.reps ?? 0} reps`;
      dialog.querySelector("[data-weight-error]").textContent = "";
      dialog.querySelector("input").value = row.weight_used ?? "";
      dialog.showModal();
      dialog.querySelector("input").focus();
      dialog.querySelector("input").select();
    });
  }
  return { eligible, weightValue, correctWeight, loadHistory, setRecords, buttonsForSets, configure };
});
