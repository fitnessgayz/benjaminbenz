package com.benjaminbenz.fwbcoach

import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun LoginScreen(
    busy: Boolean,
    message: String?,
    onSignIn: (String, String) -> Unit,
    onReset: (String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 34.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Surface(modifier = Modifier.size(76.dp), shape = CircleShape, color = FwbColor.accent) {
            Box(contentAlignment = Alignment.Center) {
                Text("FWB", color = Color.Black, fontWeight = FontWeight.Black, fontSize = 24.sp)
            }
        }
        Text("FITNESS WITH BENJAMIN", color = FwbColor.muted, fontSize = 12.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
        Text("FWB TRAINING", color = FwbColor.text, fontSize = 30.sp, fontWeight = FontWeight.Black)
        Text("Your training. Wherever you are.", color = FwbColor.muted)
        Spacer(Modifier.height(12.dp))
        FwbCard {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Welcome back", color = FwbColor.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text("Use the same client account as the iOS or web app.", color = FwbColor.muted)
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!message.isNullOrBlank()) Text(message, color = FwbColor.muted, fontSize = 13.sp)
                FwbButton(if (busy) "Signing in…" else "Sign in", { onSignIn(email, password) }, enabled = !busy)
                Text(
                    "Forgot password? Send a reset link",
                    color = FwbColor.accent,
                    modifier = Modifier.clickable(enabled = !busy) { onReset(email) },
                )
            }
        }
    }
}

@Composable
internal fun HomeScreen(
    account: ClientAccount,
    program: ClientProgram?,
    programs: List<ClientProgram>,
    onSelectProgram: (String) -> Unit,
    onWorkout: (Workout) -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Welcome back", "Today")
        ProgramPicker(program, programs, onSelectProgram)
        if (program == null) {
            FwbCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Your plan is on the way", color = FwbColor.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text("You're signed in. Your training program will appear after your coach publishes it.", color = FwbColor.muted)
                }
            }
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Surface(modifier = Modifier.size(52.dp), color = FwbColor.accent) {
                Box(contentAlignment = Alignment.Center) {
                    Text(program.initials.ifBlank { program.clientName.take(2).uppercase() }, color = Color.Black, fontWeight = FontWeight.Black)
                }
            }
            Column {
                Text(program.clientName, color = FwbColor.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text(account.email, color = FwbColor.muted, fontSize = 12.sp)
            }
        }
        FwbCard {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(program.title, color = FwbColor.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                if (program.summary.isNotBlank()) Text(program.summary, color = FwbColor.muted)
                Text("Training sessions  ${program.sessionCountUsed} / ${program.sessionCountTotal}", color = FwbColor.text)
                LinearProgressIndicator(
                    progress = { if (program.sessionCountTotal > 0) (program.sessionCountUsed.toFloat() / program.sessionCountTotal).coerceIn(0f, 1f) else 0f },
                    modifier = Modifier.fillMaxWidth(),
                    color = FwbColor.accent,
                    trackColor = FwbColor.line,
                )
                if (program.fitnessGoal.isNotBlank()) LabelValue("GOAL", program.fitnessGoal)
                if (program.focusTarget.isNotBlank()) LabelValue("FOCUS", program.focusTarget)
            }
        }
        if (program.workouts.isNotEmpty()) {
            Text("YOUR NEXT WORKOUT", color = FwbColor.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            WorkoutTile(program.workouts.first()) { onWorkout(program.workouts.first()) }
        }
        if (program.coachNoteTitle.isNotBlank() || program.coachNoteBody.isNotBlank()) {
            FwbCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(program.coachNoteTitle.ifBlank { "Coach note" }, color = FwbColor.text, fontWeight = FontWeight.Bold)
                    Text(program.coachNoteBody, color = FwbColor.muted)
                }
            }
        }
    }
}

@Composable
private fun LabelValue(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = FwbColor.accent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Text(value, color = FwbColor.text)
    }
}

@Composable
internal fun WorkoutsScreen(
    program: ClientProgram?,
    programs: List<ClientProgram>,
    onSelectProgram: (String) -> Unit,
    onWorkout: (Workout) -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Training", "Workouts")
        ProgramPicker(program, programs, onSelectProgram)
        if (program?.workouts.isNullOrEmpty()) {
            FwbCard { Text("Your assigned workouts will appear here.", color = FwbColor.muted) }
        } else {
            program!!.workouts.forEach { workout -> WorkoutTile(workout) { onWorkout(workout) } }
        }
    }
}

@Composable
private fun ProgramPicker(
    selected: ClientProgram?,
    programs: List<ClientProgram>,
    onSelect: (String) -> Unit,
) {
    if (selected == null || programs.size < 2) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("YOUR PROGRAMS", color = FwbColor.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        programs.forEach { program ->
            Surface(
                onClick = { onSelect(program.id) },
                modifier = Modifier.fillMaxWidth(),
                color = if (program.id == selected.id) FwbColor.surface else FwbColor.card,
                border = BorderStroke(1.dp, if (program.id == selected.id) FwbColor.accent else FwbColor.line),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(program.title, Modifier.padding(12.dp), color = FwbColor.text, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun WorkoutTile(workout: Workout, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        color = FwbColor.card,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, FwbColor.line),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Default.FitnessCenter, contentDescription = null, tint = FwbColor.accent)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(workout.title, color = FwbColor.text, fontWeight = FontWeight.Bold)
                Text(listOf(workout.focus, "${workout.exercises.size} exercises").filter(String::isNotBlank).joinToString(" · "), color = FwbColor.muted, fontSize = 13.sp)
            }
            Icon(Icons.Default.ArrowForward, contentDescription = null, tint = FwbColor.accent)
        }
    }
}

@Composable
internal fun WorkoutDetailScreen(workout: Workout, onBack: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = FwbColor.text) }
            Text("Workout", color = FwbColor.text, fontWeight = FontWeight.Bold)
        }
        PageTitle(workout.format.ifBlank { "Training" }, workout.title)
        if (workout.focus.isNotBlank()) Text(workout.focus, color = FwbColor.muted)
        workout.exercises.forEachIndexed { index, exercise ->
            FwbCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${index + 1}. ${exercise.name}", color = FwbColor.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    if (exercise.prescription.isNotBlank()) Text(exercise.prescription, color = FwbColor.accent)
                    if (exercise.rest.isNotBlank()) Text("Rest: ${exercise.rest}", color = FwbColor.muted)
                    exercise.instructions.forEach { Text("• $it", color = FwbColor.muted, fontSize = 13.sp) }
                    FwbButton("Watch demo", {
                        runCatching { uriHandler.openUri(exercise.demoUrl()) }
                    })
                }
            }
        }
    }
}

private fun Exercise.demoUrl(): String {
    val raw = video.trim()
    val candidate = Uri.parse(if (raw.contains("://")) raw else "https://$raw")
    val host = candidate.host?.lowercase()?.removePrefix("www.")
    if (candidate.scheme in listOf("http", "https") && host in setOf(
            "youtube.com", "youtube-nocookie.com", "m.youtube.com", "youtu.be"
        )
    ) return candidate.toString()
    return Uri.Builder().scheme("https").authority("www.youtube.com")
        .path("results").appendQueryParameter("search_query", "$name exercise demo").build().toString()
}

@Composable
internal fun FoodScreen(program: ClientProgram?) {
    val nutrition = program?.nutrition
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Nutrition", "Calories & Macros")
        if (nutrition == null) {
            FwbCard { Text("Your calorie and macro targets will appear here.", color = FwbColor.muted) }
        } else {
            Text(nutrition.source.uppercase().ifBlank { "COACH PLAN" }, color = FwbColor.accent, fontWeight = FontWeight.Bold)
            MetricCard("Calories", nutrition.calories, "cal")
            MetricCard("Protein", nutrition.protein, "g")
            MetricCard("Carbs", nutrition.carbs, "g")
            MetricCard("Fat", nutrition.fat, "g")
            if (nutrition.goal.isNotBlank()) FwbCard { LabelValue("GOAL", nutrition.goal) }
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, unit: String) {
    FwbCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = FwbColor.muted)
            Text(if (value.isBlank()) "--" else "$value $unit", color = FwbColor.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
internal fun SessionsScreen(program: ClientProgram?) {
    val uriHandler = LocalUriHandler.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Coaching", "Sessions")
        if (program == null) {
            FwbCard { Text("Your coach will update your session count.", color = FwbColor.muted) }
            return@Column
        }
        FwbCard {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Sessions used", color = FwbColor.muted)
                Text("${program.sessionCountUsed} / ${program.sessionCountTotal}", color = FwbColor.text, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                val remaining = (program.sessionCountTotal - program.sessionCountUsed).coerceAtLeast(0)
                Text("$remaining remaining", color = if (remaining <= 2) FwbColor.accent else FwbColor.muted)
            }
        }
        if (program.sessionDates.isNotEmpty()) {
            FwbCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Session dates", color = FwbColor.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    program.sessionDates.forEach { Text(it, color = FwbColor.muted) }
                }
            }
        }
        if (program.sessionArchives.isNotEmpty()) {
            FwbCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Package history", color = FwbColor.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    program.sessionArchives.forEach { archive ->
                        Text("${archive.label}: ${archive.used} / ${archive.total}", color = FwbColor.muted)
                    }
                }
            }
        }
        if (program.sheetUrl.startsWith("https://docs.google.com/spreadsheets/")) {
            FwbButton("Open Google Sheet", { uriHandler.openUri(program.sheetUrl) })
        }
    }
}

@Composable
internal fun SettingsScreen(account: ClientAccount, onSignOut: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageTitle("Your app", "Settings")
        FwbCard {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(account.email, color = FwbColor.text, fontWeight = FontWeight.Bold)
                Text("Client account", color = FwbColor.muted)
            }
        }
        SettingsLink("Open web app") { uriHandler.openUri("https://benjaminbenz.com/client-dashboard.html") }
        SettingsLink("Privacy policy") { uriHandler.openUri("https://benjaminbenz.com/fwb-coach-privacy.html") }
        SettingsLink("Help and support") { uriHandler.openUri("mailto:fwb@benjaminbenz.com?subject=FWB%20Training%20support") }
        SettingsLink("Request account deletion") { uriHandler.openUri("mailto:fwb@benjaminbenz.com?subject=FWB%20Training%20account%20deletion%20request") }
        FwbButton("Sign out", onSignOut)
    }
}

@Composable
private fun SettingsLink(label: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        color = FwbColor.card,
        border = BorderStroke(1.dp, FwbColor.line),
        shape = RoundedCornerShape(12.dp),
    ) { Text(label, Modifier.padding(16.dp), color = FwbColor.text) }
}
