package com.benjaminbenz.fwbcoach

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

internal data class WorkoutHistoryRecord(
    val sessionId: String,
    val entryDate: String,
    val workoutTitle: String,
    val exerciseCode: String,
    val exerciseName: String,
    val setNumber: Int,
    val weightUsed: Double,
    val reps: Double?,
    val durationSeconds: Double?,
    val notes: String,
    val setType: String,
)

internal data class MeasurementEntry(
    val id: String,
    val entryDate: String,
    val bodyweight: Double?,
    val bodyfat: Double?,
    val muscleMass: Double?,
    val measurements: Map<String, Double>,
    val goalNote: String,
)

private fun JsonObject.value(key: String): String = this[key]
    ?.runCatching { jsonPrimitive.contentOrNull }?.getOrNull().orEmpty()

private fun JsonObject.decimal(key: String): Double? = this[key]
    ?.runCatching { jsonPrimitive.doubleOrNull }?.getOrNull()

private fun JsonObject.integer(key: String): Int = this[key]
    ?.runCatching { jsonPrimitive.intOrNull }?.getOrNull() ?: 0

internal fun JsonObject.toHistoryRecord(): WorkoutHistoryRecord? {
    val date = value("entry_date")
    val title = value("workout_title")
    if (date.isBlank() || title.isBlank()) return null
    return WorkoutHistoryRecord(
        sessionId = value("session_id"),
        entryDate = date,
        workoutTitle = title,
        exerciseCode = value("exercise_code"),
        exerciseName = value("exercise_name").ifBlank { "Exercise" },
        setNumber = integer("set_number"),
        weightUsed = decimal("weight_used") ?: 0.0,
        reps = decimal("reps"),
        durationSeconds = decimal("duration_seconds"),
        notes = value("notes"),
        setType = value("set_type"),
    )
}

internal fun JsonObject.toMeasurementEntry(): MeasurementEntry? {
    val id = value("id")
    val date = value("entry_date")
    if (id.isBlank() || date.isBlank()) return null
    val tape = (this["measurements"] as? JsonObject)?.mapNotNull { (key, raw) ->
        raw.runCatching { jsonPrimitive.doubleOrNull }.getOrNull()?.let { key to it }
    }?.toMap().orEmpty()
    return MeasurementEntry(
        id = id,
        entryDate = date,
        bodyweight = decimal("bodyweight"),
        bodyfat = decimal("bodyfat"),
        muscleMass = decimal("muscle_mass"),
        measurements = tape,
        goalNote = value("goal_note"),
    )
}
