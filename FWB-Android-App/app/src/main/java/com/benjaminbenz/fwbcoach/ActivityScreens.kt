package com.benjaminbenz.fwbcoach

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class HistorySession(
    val key: String,
    val date: String,
    val title: String,
    val records: List<WorkoutHistoryRecord>,
)

private fun List<WorkoutHistoryRecord>.sessions(): List<HistorySession> =
    groupBy { it.sessionId.ifBlank { "${it.entryDate}|${it.workoutTitle}" } }
        .mapNotNull { (key, sets) ->
            val first = sets.firstOrNull() ?: return@mapNotNull null
            HistorySession(key, first.entryDate, first.workoutTitle, sets)
        }
        .sortedByDescending(HistorySession::date)

@Composable
internal fun LogsScreen(records: List<WorkoutHistoryRecord>, busy: Boolean, error: String?) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Your training", "Logs")
        if (busy) Text("Loading your workout history…", color = FwbColor.muted)
        if (error != null) FwbCard { Text(error, color = FwbColor.muted) }
        val sessions = remember(records) { records.sessions() }
        if (!busy && error == null && sessions.isEmpty()) {
            FwbCard { Text("Your completed workouts will appear here.", color = FwbColor.muted) }
        }
        sessions.forEach { session -> HistorySessionCard(session) }
    }
}

@Composable
private fun HistorySessionCard(session: HistorySession) {
    var expanded by remember(session.key) { mutableStateOf(false) }
    Surface(
        onClick = { expanded = !expanded },
        modifier = Modifier.fillMaxWidth(),
        color = FwbColor.card,
        border = BorderStroke(1.dp, FwbColor.line),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(session.date, color = FwbColor.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(session.title, color = FwbColor.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text("${session.records.size} logged sets", color = FwbColor.muted)
            if (expanded) {
                session.records.sortedWith(compareBy(WorkoutHistoryRecord::exerciseName, WorkoutHistoryRecord::setNumber))
                    .forEach { record ->
                        val details = buildList {
                            if (record.weightUsed > 0) add("${record.weightUsed.metric()} lb")
                            record.reps?.let { add("${it.metric()} reps") }
                            record.durationSeconds?.let { add("${it.metric()} sec") }
                        }.joinToString(" · ")
                        Text("${record.exerciseName} · Set ${record.setNumber}", color = FwbColor.text, fontWeight = FontWeight.SemiBold)
                        if (details.isNotBlank()) Text(details, color = FwbColor.muted, fontSize = 13.sp)
                        if (record.notes.isNotBlank()) Text(record.notes, color = FwbColor.muted, fontSize = 13.sp)
                    }
            }
        }
    }
}

@Composable
internal fun ProgressScreen(records: List<WorkoutHistoryRecord>, busy: Boolean, error: String?) {
    val sessions = remember(records) { records.sessions() }
    val exerciseCounts = remember(records) {
        records.filter { it.exerciseCode.uppercase() !in setOf("WARMUP", "CARDIO") }
            .groupingBy { it.exerciseName }.eachCount().entries.sortedByDescending { it.value }.take(10)
    }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Your training", "Progress")
        if (busy) Text("Loading your progress…", color = FwbColor.muted)
        if (error != null) FwbCard { Text(error, color = FwbColor.muted) }
        if (!busy && error == null && records.isEmpty()) {
            FwbCard { Text("Log a workout to start tracking your progress.", color = FwbColor.muted) }
        }
        if (records.isNotEmpty()) {
            FwbCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    ProgressCount("Workouts", sessions.size.toString())
                    ProgressCount("Sets", records.size.toString())
                    ProgressCount("Exercises", exerciseCounts.size.toString())
                }
            }
            Text("EXERCISE HISTORY", color = FwbColor.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            exerciseCounts.forEach { (name, count) ->
                FwbCard {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(name, color = FwbColor.text)
                        Text("$count sets", color = FwbColor.muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProgressCount(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(value, color = FwbColor.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(label, color = FwbColor.muted, fontSize = 12.sp)
    }
}

@Composable
internal fun StatsScreen(entries: List<MeasurementEntry>, busy: Boolean, error: String?) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Your body", "Stats")
        if (busy) Text("Loading your measurements…", color = FwbColor.muted)
        if (error != null) FwbCard { Text(error, color = FwbColor.muted) }
        if (!busy && error == null && entries.isEmpty()) {
            FwbCard { Text("Your body measurements will appear here after you save an entry.", color = FwbColor.muted) }
        }
        entries.forEach { entry ->
            FwbCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(entry.entryDate, color = FwbColor.accent, fontWeight = FontWeight.Bold)
                    entry.bodyweight?.let { Text("Bodyweight  ${it.metric()} lb", color = FwbColor.text) }
                    entry.bodyfat?.let { Text("Body fat  ${it.metric()}%", color = FwbColor.text) }
                    entry.muscleMass?.let { Text("Muscle mass  ${it.metric()} lb", color = FwbColor.text) }
                    entry.measurements.forEach { (name, value) ->
                        Text("${name.replace('_', ' ').replaceFirstChar(Char::uppercase)}  ${value.metric()}", color = FwbColor.muted)
                    }
                    if (entry.goalNote.isNotBlank()) Text(entry.goalNote, color = FwbColor.muted)
                }
            }
        }
    }
}

private fun Double.metric(): String = if (this % 1.0 == 0.0) toInt().toString() else "%.1f".format(this)
