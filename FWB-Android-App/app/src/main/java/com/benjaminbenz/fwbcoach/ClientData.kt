package com.benjaminbenz.fwbcoach

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

internal data class ClientAccount(val email: String)

internal data class Exercise(
    val code: String,
    val name: String,
    val prescription: String,
    val rest: String,
    val instructions: List<String>,
    val video: String,
)

internal data class Workout(
    val id: String,
    val title: String,
    val focus: String,
    val format: String,
    val exercises: List<Exercise>,
)

internal data class NutritionPlan(
    val calories: String,
    val protein: String,
    val carbs: String,
    val fat: String,
    val source: String,
    val goal: String,
)

internal data class SessionArchive(
    val label: String,
    val used: Int,
    val total: Int,
    val dates: List<String>,
)

internal data class ClientProgram(
    val id: String,
    val clientEmail: String,
    val clientName: String,
    val initials: String,
    val title: String,
    val summary: String,
    val sessionCountUsed: Int,
    val sessionCountTotal: Int,
    val fitnessGoal: String,
    val focusTarget: String,
    val coachNoteTitle: String,
    val coachNoteBody: String,
    val nutrition: NutritionPlan?,
    val workouts: List<Workout>,
    val sessionDates: List<String>,
    val sessionArchives: List<SessionArchive>,
    val sheetUrl: String,
    val updatedAt: String,
)

private fun JsonObject.string(key: String): String = this[key]?.runCatching { jsonPrimitive.contentOrNull }?.getOrNull().orEmpty()
private fun JsonObject.number(key: String): Int = this[key]?.runCatching { jsonPrimitive.intOrNull }?.getOrNull() ?: 0
private fun JsonObject.flag(key: String): Boolean = this[key]?.runCatching { jsonPrimitive.booleanOrNull }?.getOrNull() ?: false
private fun JsonObject.objectValue(key: String): JsonObject? = this[key] as? JsonObject
private fun JsonObject.arrayValue(key: String): JsonArray? = this[key] as? JsonArray
private fun JsonElement?.text(): String = this?.runCatching { jsonPrimitive.contentOrNull }?.getOrNull().orEmpty()

private fun JsonObject.instructions(): List<String> {
    for (key in listOf("instructions", "instruction", "howTo", "how_to", "cues")) {
        val raw = this[key] ?: continue
        val steps = when (raw) {
            is JsonArray -> raw.map { it.text().trim() }.filter(String::isNotBlank)
            else -> raw.text().lineSequence()
                .map { it.trim().replace(Regex("^\\s*(?:\\d+[.)]|[-•])\\s*"), "") }
                .filter(String::isNotBlank)
                .toList()
        }
        if (steps.isNotEmpty()) return steps
    }
    return emptyList()
}

private fun JsonObject.video(): String = listOf("video", "videoUrl", "video_url", "youtube_url")
    .firstNotNullOfOrNull { key -> string(key).takeIf(String::isNotBlank) }.orEmpty()

private fun JsonObject.toExercise(): Exercise = Exercise(
    code = string("code"),
    name = string("name").ifBlank { "Exercise" },
    prescription = string("prescription"),
    rest = string("rest"),
    instructions = instructions(),
    video = video(),
)

/** iOS and web apply version 2 overrides only while their saved source still matches. */
private fun JsonObject.displayWorkouts(): List<Workout> {
    val assigned = arrayValue("workouts") ?: return emptyList()
    val layout = objectValue("client_workout_layout")
    val sourceMatches = layout != null && layout.number("version") == 2 &&
        runCatching { Json.parseToJsonElement(layout.string("source")) == assigned }.getOrDefault(false)
    val overrides = if (sourceMatches) layout?.get("exercises") else null
    return assigned.mapIndexedNotNull { index, raw ->
        val workout = raw as? JsonObject ?: return@mapIndexedNotNull null
        val assignedExercises = workout.arrayValue("exercises")
        val replacement = when (overrides) {
            is JsonArray -> overrides.getOrNull(index) as? JsonArray
            is JsonObject -> overrides[index.toString()] as? JsonArray
            else -> null
        }
        val validReplacement = replacement?.takeIf { candidates ->
            candidates.all { it is JsonObject && it.string("name").isNotBlank() }
        }
        val exercises = (validReplacement ?: assignedExercises).orEmpty()
            .mapNotNull { it as? JsonObject }
            .map(JsonObject::toExercise)
        Workout(
            id = workout.string("id").ifBlank { workout.string("workout_id") }
                .ifBlank { workout.string("template_id") }.ifBlank { workout.string("title") },
            title = workout.string("title").ifBlank { "Workout" },
            focus = workout.string("focus"),
            format = workout.string("format"),
            exercises = exercises,
        )
    }
}

internal fun JsonObject.toClientProgram(): ClientProgram? {
    val id = string("id")
    val email = string("client_email")
    if (id.isBlank() || email.isBlank() || !flag("active") || flag("client_archived")) return null
    val workouts = displayWorkouts()
    val rawNutrition = objectValue("nutrition_plan")
    val nutrition = rawNutrition?.let {
        NutritionPlan(
            calories = it.string("calories"),
            protein = it.string("protein"),
            carbs = it.string("carbs"),
            fat = it.string("fat"),
            source = it.string("source"),
            goal = it.string("goal"),
        )
    }
    val archives = arrayValue("session_package_history").orEmpty().mapNotNull { raw ->
        val archive = raw as? JsonObject ?: return@mapNotNull null
        SessionArchive(
            label = archive.string("label").ifBlank { "Previous package" },
            used = archive.number("used"),
            total = archive.number("total"),
            dates = archive.arrayValue("dates").orEmpty().map { it.text() }.filter(String::isNotBlank),
        )
    }
    return ClientProgram(
        id = id,
        clientEmail = email,
        clientName = string("client_name").ifBlank { "Client" },
        initials = string("initials"),
        title = string("program_title").ifBlank { "Your Program" },
        summary = string("program_summary"),
        sessionCountUsed = number("session_count_used"),
        sessionCountTotal = number("session_count_total"),
        fitnessGoal = string("fitness_goal"),
        focusTarget = string("focus_target"),
        coachNoteTitle = string("coach_note_title"),
        coachNoteBody = string("coach_note_body"),
        nutrition = nutrition,
        workouts = workouts,
        sessionDates = arrayValue("session_dates").orEmpty().map { it.text() }.filter(String::isNotBlank),
        sessionArchives = archives,
        sheetUrl = string("sheet_url"),
        updatedAt = string("updated_at"),
    )
}
