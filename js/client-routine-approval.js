(function attachRoutineApproval(root) {
  "use strict";

  function append(parent, tag, text) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    parent.append(element);
    return element;
  }

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function showWorkoutList(parent, label, workouts) {
    if (!Array.isArray(workouts)) return;
    append(parent, "h3", label);
    for (const workout of workouts) {
      if (!workout || !Array.isArray(workout.exercises)) continue;
      append(parent, "h4", [days[workout.weekday], workout.title].filter(Boolean).join(" · "));
      const sets = append(parent, "ul");
      for (const exercise of workout.exercises) {
        append(sets, "li", [exercise?.name, exercise?.prescription, exercise?.rest ? `Rest ${exercise.rest}` : null].filter(Boolean).join(" · "));
      }
    }
  }

  async function open(client) {
    const url = new URL(root.location.href);
    const proposalId = url.searchParams.get("routine_proposal");
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(proposalId || "")
        || document.querySelector("[data-routine-approval]")) return;

    const dialog = document.createElement("dialog");
    dialog.className = "client-workout-plan-dialog";
    dialog.dataset.routineApproval = "";
    dialog.setAttribute("aria-labelledby", "routine-approval-title");
    const top = append(dialog, "div");
    top.className = "plan-dialog-top";
    const heading = append(top, "h2", "Review your ChatGPT routine");
    heading.id = "routine-approval-title";
    const close = append(top, "button", "Close");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    const status = append(dialog, "p", "Loading your routine preview…");
    status.setAttribute("role", "status");
    const detail = append(dialog, "div");
    const approve = append(dialog, "button", "Approve and save routine");
    approve.type = "button";
    approve.className = "plan-primary";
    approve.hidden = true;
    dialog.addEventListener("close", () => {
      const current = new URL(root.location.href);
      current.searchParams.delete("routine_proposal");
      root.history.replaceState(root.history.state, "", current);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();

    const { data, error } = await client.rpc("get_gruntr_routine_proposal", { p_proposal_id: proposalId });
    if (error || !data) {
      status.textContent = "This preview is unavailable for the signed-in GRUNTR account.";
      return;
    }
    if (data.state === "saved" || data.state === "expired") {
      status.textContent = data.state === "saved" ? "This routine was already saved." : "This preview expired. Request a new preview in ChatGPT.";
      return;
    }
    if (data.state !== "awaiting_approval" || !Array.isArray(data.after)) {
      status.textContent = "This preview could not be displayed.";
      return;
    }

    status.textContent = "Review the workout days, exercises, sets, and rep ranges before saving.";
    showWorkoutList(detail, data.previous_title ? `Current routine · ${data.previous_title}` : "Current routine", data.before);
    showWorkoutList(detail, `Proposed routine · ${data.title}`, data.after);
    approve.hidden = false;
    approve.addEventListener("click", async () => {
      approve.disabled = true;
      try {
        const { data: saved, error: approvalError } = await client.rpc("approve_gruntr_routine", { p_proposal_id: proposalId });
        if (approvalError || saved?.state !== "saved") {
          status.textContent = approvalError?.code === "22023" ? approvalError.message : "GRUNTR could not confirm the save.";
          approve.disabled = false;
          return;
        }
        approve.hidden = true;
        status.textContent = `Saved ${saved.title} to your GRUNTR routines.`;
      } catch {
        status.textContent = "GRUNTR could not confirm the save. You can safely try again.";
        approve.disabled = false;
      }
    });
  }

  root.FWB_ROUTINE_APPROVAL = { open };
}(window));
