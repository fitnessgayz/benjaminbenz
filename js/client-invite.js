const inviteConfig = window.FWB_SUPABASE_CONFIG || {};
const inviteConfigured = Boolean(
  inviteConfig.url &&
  inviteConfig.anonKey &&
  !inviteConfig.url.includes("PASTE_") &&
  !inviteConfig.anonKey.includes("PASTE_")
);
const inviteSupabase = inviteConfigured && window.supabase
  ? window.supabase.createClient(inviteConfig.url, inviteConfig.anonKey)
  : null;
const inviteSteps = ["account", "fitness", "macros"];
const inviteStepLabels = ["Account", "Fitness", "Macros"];
let passwordFlow = "invite";
let activeInviteStep = 0;
let invitePasswordSaved = false;
let inviteSubmitting = false;
let inviteTouchStartX = null;

function inviteForm() {
  return document.getElementById("client-invite-form");
}

function setInviteStatus(message) {
  const status = document.getElementById("client-invite-status");
  if (status) status.textContent = message;
}

function inviteField(name) {
  return inviteForm()?.elements.namedItem(name) || null;
}

function inviteSelectedValue(name) {
  return inviteForm()?.querySelector(`[name="${name}"]:checked`)?.value || "";
}

function inviteNumber(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function inviteRoundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}

function inviteHeightInches(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"');

  if (!text) return 0;

  const cmMatch = text.match(/^(\d+(?:\.\d+)?)\s*cm\b/);
  if (cmMatch) {
    const inches = Number(cmMatch[1]) / 2.54;
    return inches >= 48 && inches <= 96 ? inches : 0;
  }

  const feetMatch = text.match(/^(\d+)\s*(?:'|ft|feet)\s*(\d+)?/);
  if (feetMatch) {
    const inches = (Number(feetMatch[1]) * 12) + Number(feetMatch[2] || 0);
    return inches >= 48 && inches <= 96 ? inches : 0;
  }

  const separatedFeetMatch = text.match(/^(\d)\s*(?:-|\.|\s)\s*(\d{1,2})\s*(?:in|")?$/);
  if (separatedFeetMatch) {
    const inches = (Number(separatedFeetMatch[1]) * 12) + Number(separatedFeetMatch[2] || 0);
    return inches >= 48 && inches <= 96 ? inches : 0;
  }

  const plainNumber = inviteNumber(text);
  const inches = plainNumber <= 8 ? plainNumber * 12 : plainNumber;
  return inches >= 48 && inches <= 96 ? inches : 0;
}

function inviteActivityFactor(workoutsPerWeek, movement, intensity) {
  const movementBase = { mostly_sitting: 1.2, mixed: 1.35, active_job: 1.5 };
  const workoutNumber = Math.min(Math.max(Number.parseInt(workoutsPerWeek, 10) || 0, 0), 7);
  const workoutBoost = workoutNumber === 0 ? 0 : workoutNumber <= 2 ? 0.1 : workoutNumber <= 4 ? 0.2 : workoutNumber <= 6 ? 0.3 : 0.35;
  const intensityBoost = intensity === "hard" ? 0.05 : intensity === "light" ? -0.03 : 0;
  return Math.min(Math.max((movementBase[movement] || movementBase.mixed) + workoutBoost + intensityBoost, 1.2), 1.85);
}

function inviteNutritionGoalMultiplier(goal) {
  if (goal === "fat_loss") return 0.85;
  if (goal === "muscle_gain") return 1.1;
  if (goal === "recomposition") return 0.98;
  return 1;
}

function inviteProteinPerPound(goal) {
  if (goal === "fat_loss" || goal === "recomposition") return 1;
  if (goal === "muscle_gain") return 0.9;
  return 0.8;
}

function inviteNutritionGoalLabel(goal) {
  return {
    fat_loss: "fat loss",
    muscle_gain: "muscle gain",
    recomposition: "building muscle and leaning out",
    maintenance: "maintenance"
  }[goal] || "your goal";
}

function calculateInviteNutritionPlan() {
  const age = Number.parseInt(inviteField("nutrition_age")?.value || "", 10) || 0;
  const weightLbs = inviteNumber(inviteField("current_weight")?.value);
  const height = inviteField("height")?.value.trim() || "";
  const heightInches = inviteHeightInches(height);
  const sex = inviteField("nutrition_sex")?.value || "";
  const goal = inviteField("nutrition_goal")?.value || "maintenance";
  const workoutsPerWeek = inviteField("nutrition_workouts")?.value || "0";
  const dailyMovement = inviteField("nutrition_movement")?.value || "mixed";
  const trainingIntensity = inviteField("nutrition_intensity")?.value || "moderate";

  if (!age || !weightLbs || !heightInches || !sex) {
    return { error: new Error("Add age, sex, height, and current weight first.") };
  }

  const weightKg = weightLbs * 0.45359237;
  const heightCm = heightInches * 2.54;
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + (sex === "female" ? -161 : 5);
  const activityFactor = inviteActivityFactor(workoutsPerWeek, dailyMovement, trainingIntensity);
  const maintenanceCalories = inviteRoundToNearest(bmr * activityFactor, 25);
  const calories = inviteRoundToNearest(maintenanceCalories * inviteNutritionGoalMultiplier(goal), 25);
  const protein = inviteRoundToNearest(weightLbs * inviteProteinPerPound(goal), 5);
  const fat = inviteRoundToNearest((calories * 0.25) / 9, 5);
  const carbs = inviteRoundToNearest(Math.max(calories - ((protein * 4) + (fat * 9)), 0) / 4, 5);

  return {
    plan: {
      calories: `${calories} cal`,
      protein: `${protein}g`,
      carbs: `${carbs}g`,
      fat: `${fat}g`,
      guide: `Starting target for ${inviteNutritionGoalLabel(goal)}. Review with Benjamin and adjust based on energy, hunger, performance, and progress.`,
      source: "client_onboarding_calculator",
      goal,
      sex,
      age: String(age),
      height,
      current_weight: String(weightLbs),
      workouts_per_week: String(workoutsPerWeek),
      daily_movement: dailyMovement,
      training_intensity: trainingIntensity,
      activity_factor: activityFactor.toFixed(2),
      maintenance_calories: String(maintenanceCalories),
      updated_at: new Date().toISOString()
    }
  };
}

function renderInviteMacroTarget() {
  const wantsMacros = inviteSelectedValue("wants_macros") !== "no";
  const fields = document.getElementById("invite-macro-fields");
  if (fields) fields.hidden = !wantsMacros;

  const result = wantsMacros ? calculateInviteNutritionPlan() : { error: true };
  const values = result.plan || {};
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value || "—";
  };

  setValue("invite-calories", values.calories?.replace(" cal", ""));
  setValue("invite-protein", values.protein);
  setValue("invite-carbs", values.carbs);
  setValue("invite-fat", values.fat);
}

function updateInviteDeckPeeks() {
  const leftLabel = document.getElementById("invite-deck-left-label");
  const leftState = document.getElementById("invite-deck-left-state");
  const rightLabel = document.getElementById("invite-deck-right-label");
  const rightState = document.getElementById("invite-deck-right-state");

  if (activeInviteStep === 0) {
    if (leftLabel) leftLabel.textContent = "Fitness";
    if (leftState) leftState.textContent = "Next";
    if (rightLabel) rightLabel.textContent = "Macros";
    if (rightState) rightState.textContent = "Optional";
  } else if (activeInviteStep === 1) {
    if (leftLabel) leftLabel.textContent = "Account";
    if (leftState) leftState.textContent = "Saved";
    if (rightLabel) rightLabel.textContent = "Macros";
    if (rightState) rightState.textContent = "Optional";
  } else {
    if (leftLabel) leftLabel.textContent = "Account";
    if (leftState) leftState.textContent = "Saved";
    if (rightLabel) rightLabel.textContent = "Fitness";
    if (rightState) rightState.textContent = "Saved";
  }
}

function renderInviteStep(index, direction = "forward") {
  if (passwordFlow === "recovery") index = 0;

  const form = inviteForm();
  const deck = document.getElementById("invite-deck");
  activeInviteStep = Math.min(Math.max(index, 0), inviteSteps.length - 1);

  form?.querySelectorAll("[data-invite-step]").forEach((step, stepIndex) => {
    step.hidden = stepIndex !== activeInviteStep;
  });
  form?.querySelectorAll("[data-invite-progress]").forEach((segment, stepIndex) => {
    segment.classList.toggle("is-complete", stepIndex < activeInviteStep);
    segment.classList.toggle("is-active", stepIndex === activeInviteStep);
  });
  form?.querySelectorAll("[data-invite-dot]").forEach((dot, stepIndex) => {
    dot.classList.toggle("is-active", stepIndex === activeInviteStep);
  });

  const count = document.getElementById("invite-step-count");
  const label = document.getElementById("invite-step-label");
  const back = document.getElementById("invite-step-back");
  const next = document.getElementById("invite-step-next");
  if (count) count.textContent = passwordFlow === "recovery" ? "Password recovery" : `Step ${activeInviteStep + 1} of ${inviteSteps.length}`;
  if (label) label.textContent = passwordFlow === "recovery" ? "Account" : inviteStepLabels[activeInviteStep];
  if (back) back.disabled = activeInviteStep === 0;
  if (next) next.disabled = passwordFlow === "recovery" || activeInviteStep === inviteSteps.length - 1;

  if (deck) {
    deck.classList.remove("is-moving-forward", "is-moving-back");
    void deck.offsetWidth;
    deck.classList.add(direction === "back" ? "is-moving-back" : "is-moving-forward");
  }

  updateInviteDeckPeeks();
  setInviteStatus("");
}

function validateInvitePassword() {
  const password = inviteField("password")?.value || "";
  const confirmPassword = inviteField("confirm_password")?.value || "";

  if (password.length < 8) {
    setInviteStatus("Use at least 8 characters.");
    inviteField("password")?.focus();
    return false;
  }
  if (password !== confirmPassword) {
    setInviteStatus("Passwords do not match.");
    inviteField("confirm_password")?.focus();
    return false;
  }
  return true;
}

function validateInviteFitness() {
  const checks = [
    [inviteField("height"), inviteHeightInches(inviteField("height")?.value), "Add your height, such as 5 ft 10 in."],
    [inviteField("current_weight"), inviteNumber(inviteField("current_weight")?.value), "Add your current weight."],
    [inviteForm()?.querySelector('[name="fitness_goal"]'), inviteSelectedValue("fitness_goal"), "Choose your primary goal."],
    [inviteForm()?.querySelector('[name="training_days"]'), inviteSelectedValue("training_days"), "Choose how many days you plan to train."]
  ];

  for (const [field, isValid, message] of checks) {
    if (!isValid) {
      setInviteStatus(message);
      field?.focus();
      return false;
    }
  }
  return true;
}

async function notifyPasswordCreated() {
  if (!inviteSupabase || !inviteConfig.url || !inviteConfig.anonKey) return;

  const { data } = await inviteSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;

  try {
    await fetch(`${inviteConfig.url}/functions/v1/notify-client-password-set`, {
      method: "POST",
      headers: {
        "apikey": inviteConfig.anonKey,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
  } catch (error) {
    console.warn("Could not send password-created notification.", error);
  }
}

async function saveInvitePassword() {
  if (invitePasswordSaved) return true;
  if (!validateInvitePassword() || !inviteSupabase) return false;

  setInviteStatus("Saving password...");
  const { error } = await inviteSupabase.auth.updateUser({ password: inviteField("password").value });
  if (error) {
    setInviteStatus(error.message);
    return false;
  }

  invitePasswordSaved = true;
  await notifyPasswordCreated();
  if (passwordFlow === "recovery") {
    setInviteStatus("Password saved. Returning to login...");
    window.location.href = "client-login.html";
  }
  return true;
}

function syncInviteMacroDefaults() {
  const goalMap = {
    "Lose fat": "fat_loss",
    "Build muscle": "muscle_gain",
    "Get stronger": "maintenance",
    "Move better": "maintenance"
  };
  const goal = inviteSelectedValue("fitness_goal");
  const days = inviteSelectedValue("training_days");
  if (inviteField("nutrition_goal") && goalMap[goal]) inviteField("nutrition_goal").value = goalMap[goal];
  if (inviteField("nutrition_workouts") && days) inviteField("nutrition_workouts").value = days;
  renderInviteMacroTarget();
}

async function advanceInviteStep() {
  if (inviteSubmitting) return;

  if (activeInviteStep === 0) {
    const saved = await saveInvitePassword();
    if (!saved || passwordFlow === "recovery") return;
  }
  if (activeInviteStep === 1) {
    if (!validateInviteFitness()) return;
    syncInviteMacroDefaults();
  }
  if (activeInviteStep < inviteSteps.length - 1) renderInviteStep(activeInviteStep + 1, "forward");
}

function goBackInviteStep() {
  if (!inviteSubmitting && activeInviteStep > 0) renderInviteStep(activeInviteStep - 1, "back");
}

function inviteOnboardingAnswers(wantsMacros, nutritionPlan = null) {
  return {
    height: inviteField("height")?.value.trim() || "",
    current_weight: String(inviteNumber(inviteField("current_weight")?.value)),
    body_fat: inviteField("body_fat")?.value.trim() || "",
    fitness_goal: inviteSelectedValue("fitness_goal"),
    training_days_per_week: inviteSelectedValue("training_days"),
    training_experience: inviteField("training_experience")?.value || "",
    available_equipment: inviteField("available_equipment")?.value || "",
    limitations: inviteField("limitations")?.value.trim() || "",
    macro_estimate_requested: wantsMacros,
    nutrition_goal: wantsMacros ? inviteField("nutrition_goal")?.value || "" : "",
    age: wantsMacros ? inviteField("nutrition_age")?.value.trim() || "" : "",
    sex_for_calculation: wantsMacros ? inviteField("nutrition_sex")?.value || "" : "",
    daily_movement: wantsMacros ? inviteField("nutrition_movement")?.value || "" : "",
    training_intensity: wantsMacros ? inviteField("nutrition_intensity")?.value || "" : "",
    macro_estimate: nutritionPlan,
    completed_at: new Date().toISOString()
  };
}

async function saveInviteOnboarding() {
  if (!inviteSupabase || inviteSubmitting || !validateInviteFitness()) return;

  const wantsMacros = inviteSelectedValue("wants_macros") !== "no";
  const nutritionResult = wantsMacros ? calculateInviteNutritionPlan() : {};
  if (wantsMacros && nutritionResult.error) {
    setInviteStatus(nutritionResult.error.message);
    if (!inviteField("nutrition_age")?.value) inviteField("nutrition_age")?.focus();
    else if (!inviteField("nutrition_sex")?.value) inviteField("nutrition_sex")?.focus();
    return;
  }

  inviteSubmitting = true;
  setInviteStatus("Saving your profile...");

  try {
    const { data: userData, error: userError } = await inviteSupabase.auth.getUser();
    const email = userData.user?.email?.trim().toLowerCase() || "";
    if (userError || !email) throw userError || new Error("Could not verify your client login.");

    const { data: program, error: loadError } = await inviteSupabase
      .from("client_programs")
      .select("id, client_name, nutrition_plan")
      .ilike("client_email", email)
      .eq("active", true)
      .eq("client_archived", false)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!program?.id) throw new Error("Your password is saved, but your client profile could not be found. Contact Benjamin for help.");

    const now = new Date().toISOString();
    const sourceSubmissionId = `invite-${userData.user.id}`;
    const { data: existingQuestionnaire, error: questionnaireLoadError } = await inviteSupabase
      .from("client_fitness_questionnaires")
      .select("id")
      .eq("source", "client_portal")
      .eq("source_submission_id", sourceSubmissionId)
      .maybeSingle();
    if (questionnaireLoadError) throw questionnaireLoadError;

    if (!existingQuestionnaire?.id) {
      const { error: questionnaireError } = await inviteSupabase
        .from("client_fitness_questionnaires")
        .insert({
          source: "client_portal",
          source_submission_id: sourceSubmissionId,
          submitted_at: now,
          respondent_name: program.client_name?.trim() || email.split("@")[0],
          respondent_email: email,
          linked_user_id: userData.user.id,
          linked_client_email: email,
          match_status: "matched",
          answers: inviteOnboardingAnswers(wantsMacros, nutritionResult.plan || null),
          profile_imported_at: now
        });
      if (questionnaireError) throw questionnaireError;
    }

    const update = {
      height: inviteField("height")?.value.trim() || "Not set",
      starting_weight: String(inviteNumber(inviteField("current_weight")?.value)),
      fitness_goal: inviteSelectedValue("fitness_goal")
    };
    const bodyFat = inviteField("body_fat")?.value.trim() || "";
    if (bodyFat) update.starting_bodyfat = bodyFat;
    if (nutritionResult.plan) {
      update.nutrition_plan = {
        ...(program.nutrition_plan && typeof program.nutrition_plan === "object" ? program.nutrition_plan : {}),
        ...nutritionResult.plan
      };
    }

    const { error: saveError } = await inviteSupabase.from("client_programs").update(update).eq("id", program.id);
    if (saveError) throw saveError;

    setInviteStatus("Setup complete. Opening your dashboard...");
    window.location.href = "client-dashboard.html?v=manual-sessions-1";
  } catch (error) {
    setInviteStatus(error?.message || "Could not save your profile. Try again.");
    inviteSubmitting = false;
  }
}

function setInviteRecoveryMode() {
  const form = inviteForm();
  form?.classList.add("is-recovery");
  const heading = document.getElementById("invite-title");
  const copy = form?.querySelector('[data-invite-step="account"] .invite-step-copy');
  const button = form?.querySelector("[data-invite-continue]");
  if (heading) heading.textContent = "Reset password";
  if (copy) copy.textContent = "Choose a new password for your account.";
  if (button) button.textContent = "Save password";
}

async function prepareInviteSession() {
  const form = inviteForm();
  if (!form) return;
  if (!inviteSupabase) {
    setInviteStatus("Client login is not connected yet.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const authType = params.get("type") || hashParams.get("type") || "";
  const inviteError = params.get("error_description") || hashParams.get("error_description");

  if (authType === "recovery") passwordFlow = "recovery";
  if (inviteError) {
    setInviteStatus(inviteError);
    return;
  }

  if (code) {
    const { error } = await inviteSupabase.auth.exchangeCodeForSession(code);
    if (error) {
      setInviteStatus(error.message);
      return;
    }
  } else if (accessToken && refreshToken) {
    const { error } = await inviteSupabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      setInviteStatus(error.message);
      return;
    }
  }

  const { data } = await inviteSupabase.auth.getSession();
  if (!data.session) {
    setInviteStatus("Open this page from the invite email link.");
    return;
  }

  form.hidden = false;
  window.history.replaceState({}, document.title, window.location.pathname);
  if (passwordFlow === "recovery") setInviteRecoveryMode();
  renderInviteStep(0);
  setInviteStatus("Choose a password with at least 8 characters.");
}

function handleInviteOnboarding() {
  const form = inviteForm();
  const deck = document.getElementById("invite-deck");
  if (!form || !inviteSupabase) return;

  form.addEventListener("click", (event) => {
    if (event.target.closest("[data-invite-continue]")) advanceInviteStep();
    if (event.target.closest("[data-invite-back]")) goBackInviteStep();
  });
  document.getElementById("invite-step-back")?.addEventListener("click", goBackInviteStep);
  document.getElementById("invite-step-next")?.addEventListener("click", advanceInviteStep);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveInviteOnboarding();
  });
  form.addEventListener("input", (event) => {
    if (event.target.closest('[data-invite-step="macros"], [data-invite-step="fitness"]')) renderInviteMacroTarget();
  });
  form.addEventListener("change", (event) => {
    if (event.target.name === "wants_macros") renderInviteMacroTarget();
    if (event.target.name === "fitness_goal" || event.target.name === "training_days") syncInviteMacroDefaults();
  });
  deck?.addEventListener("touchstart", (event) => {
    inviteTouchStartX = event.touches[0]?.clientX ?? null;
  }, { passive: true });
  deck?.addEventListener("touchend", (event) => {
    if (inviteTouchStartX === null || event.target.closest("input, select, textarea, button, label")) {
      inviteTouchStartX = null;
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? inviteTouchStartX;
    const distance = endX - inviteTouchStartX;
    inviteTouchStartX = null;
    if (distance < -55) advanceInviteStep();
    if (distance > 55) goBackInviteStep();
  }, { passive: true });
}

prepareInviteSession();
handleInviteOnboarding();
