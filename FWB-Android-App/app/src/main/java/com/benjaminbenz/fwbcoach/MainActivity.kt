package com.benjaminbenz.fwbcoach

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.EventNote
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(23, 25, 23)
        window.navigationBarColor = android.graphics.Color.rgb(23, 25, 23)
        setContent { FwbTheme { FwbApp() } }
    }
}

internal object FwbColor {
    val accent = Color(0xFFD6FF35)
    val background = Color(0xFF171917)
    val card = Color(0xFF202320)
    val surface = Color(0xFF222522)
    val text = Color(0xFFF7F7F2)
    val muted = Color(0xFF9E9E94)
    val line = Color(0xFF5B605B)
    val red = Color(0xFFFF3B30)
}

private val inter = FontFamily(Font(R.font.inter))

@Composable
private fun FwbTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = FwbColor.accent,
            onPrimary = Color.Black,
            background = FwbColor.background,
            onBackground = FwbColor.text,
            surface = FwbColor.card,
            onSurface = FwbColor.text,
        ),
        typography = androidx.compose.material3.Typography().let { base ->
            base.copy(
                bodyLarge = base.bodyLarge.copy(fontFamily = inter),
                bodyMedium = base.bodyMedium.copy(fontFamily = inter),
                titleLarge = base.titleLarge.copy(fontFamily = inter),
                headlineLarge = base.headlineLarge.copy(fontFamily = inter),
            )
        },
        content = content,
    )
}

internal enum class ClientTab(val label: String) {
    HOME("Home"), WORKOUTS("Workouts"), LOGS("Logs"), PROGRESS("Progress"),
    STATS("Stats"), FOOD("Food"), QUESTIONNAIRE("PAR-Q"), SESSIONS("Sessions"), SETTINGS("Settings")
}

@Composable
private fun FwbApp() {
    val scope = rememberCoroutineScope()
    var restoring by remember { mutableStateOf(true) }
    var account by remember { mutableStateOf<ClientAccount?>(null) }
    var authBusy by remember { mutableStateOf(false) }
    var authMessage by remember { mutableStateOf<String?>(null) }
    var programs by remember { mutableStateOf<List<ClientProgram>>(emptyList()) }
    var programBusy by remember { mutableStateOf(false) }
    var programError by remember { mutableStateOf<String?>(null) }
    var history by remember { mutableStateOf<List<WorkoutHistoryRecord>>(emptyList()) }
    var historyBusy by remember { mutableStateOf(false) }
    var historyError by remember { mutableStateOf<String?>(null) }
    var measurements by remember { mutableStateOf<List<MeasurementEntry>>(emptyList()) }
    var measurementsBusy by remember { mutableStateOf(false) }
    var measurementsError by remember { mutableStateOf<String?>(null) }
    var selectedProgramId by remember { mutableStateOf<String?>(null) }
    var selectedTab by remember { mutableStateOf(ClientTab.HOME) }
    var selectedWorkout by remember { mutableStateOf<Workout?>(null) }

    LaunchedEffect(Unit) {
        account = runCatching { SupabaseGateway.restoreAccount() }.getOrNull()
        restoring = false
    }
    LaunchedEffect(account) {
        val current = account ?: return@LaunchedEffect
        programBusy = true
        programError = null
        runCatching { SupabaseGateway.loadPrograms(current) }
            .onSuccess { programs = it }
            .onFailure { programError = "Your training plan could not be loaded. Check your connection and retry." }
        programBusy = false
    }
    LaunchedEffect(account) {
        val current = account ?: return@LaunchedEffect
        historyBusy = true
        historyError = null
        runCatching { SupabaseGateway.loadHistory(current) }
            .onSuccess { history = it }
            .onFailure { historyError = "Your workout history could not be loaded. Check your connection and retry." }
        historyBusy = false
    }
    LaunchedEffect(account) {
        val current = account ?: return@LaunchedEffect
        measurementsBusy = true
        measurementsError = null
        runCatching { SupabaseGateway.loadMeasurements(current) }
            .onSuccess { measurements = it }
            .onFailure { measurementsError = "Your measurements could not be loaded. Check your connection and retry." }
        measurementsBusy = false
    }

    Box(Modifier.fillMaxSize().background(FwbColor.background)) {
        when {
            restoring -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = FwbColor.accent)
            account == null -> LoginScreen(
                busy = authBusy,
                message = authMessage,
                onSignIn = { email, password ->
                    scope.launch {
                        authBusy = true
                        authMessage = null
                        runCatching { SupabaseGateway.signIn(email, password) }
                            .onSuccess { account = it }
                            .onFailure { authMessage = "That email or password did not work. Please try again." }
                        authBusy = false
                    }
                },
                onReset = { email ->
                    scope.launch {
                        authBusy = true
                        authMessage = null
                        runCatching { SupabaseGateway.resetPassword(email) }
                            .onSuccess { authMessage = "If that account exists, a reset link was sent." }
                            .onFailure { authMessage = "The reset link could not be sent. Try again." }
                        authBusy = false
                    }
                },
            )
            else -> {
                val current = account!!
                val program = programs.firstOrNull { it.id == selectedProgramId } ?: programs.firstOrNull()
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.weight(1f)) {
                        if (selectedWorkout != null) {
                            WorkoutDetailScreen(selectedWorkout!!, onBack = { selectedWorkout = null })
                        } else if (programBusy) {
                            CircularProgressIndicator(Modifier.align(Alignment.Center), color = FwbColor.accent)
                        } else if (programError != null) {
                            ErrorScreen(programError!!) {
                                scope.launch {
                                    programBusy = true
                                    runCatching { SupabaseGateway.loadPrograms(current) }
                                        .onSuccess { programs = it; programError = null }
                                        .onFailure { programError = "Your training plan could not be loaded. Check your connection and retry." }
                                    programBusy = false
                                }
                            }
                        } else {
                            when (selectedTab) {
                                ClientTab.HOME -> HomeScreen(current, program, programs, onSelectProgram = { selectedProgramId = it }, onWorkout = { selectedWorkout = it })
                                ClientTab.WORKOUTS -> WorkoutsScreen(program, programs, onSelectProgram = { selectedProgramId = it }, onWorkout = { selectedWorkout = it })
                                ClientTab.LOGS -> LogsScreen(history, historyBusy, historyError)
                                ClientTab.PROGRESS -> ProgressScreen(history, historyBusy, historyError)
                                ClientTab.STATS -> StatsScreen(measurements, measurementsBusy, measurementsError)
                                ClientTab.FOOD -> FoodScreen(program)
                                ClientTab.SESSIONS -> SessionsScreen(program)
                                ClientTab.SETTINGS -> SettingsScreen(current, onSignOut = {
                                    scope.launch {
                                        authBusy = true
                                        runCatching { SupabaseGateway.signOut() }
                                        programs = emptyList()
                                        history = emptyList()
                                        measurements = emptyList()
                                        selectedProgramId = null
                                        account = null
                                        selectedTab = ClientTab.HOME
                                        authBusy = false
                                    }
                                })
                                else -> InDevelopmentScreen(selectedTab.label)
                            }
                        }
                    }
                    if (selectedWorkout == null) {
                        ClientDock(selectedTab) { selectedTab = it }
                    }
                }
            }
        }
    }
}

@Composable
private fun ClientDock(selected: ClientTab, select: (ClientTab) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().background(FwbColor.background).horizontalScroll(rememberScrollState()).padding(6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ClientTab.entries.forEach { tab ->
            val active = selected == tab
            Surface(
                onClick = { select(tab) },
                shape = RoundedCornerShape(28.dp),
                color = if (active) Color(0xFF454A45) else FwbColor.card,
                border = BorderStroke(1.dp, FwbColor.line),
            ) {
                Column(
                    modifier = Modifier.size(width = 78.dp, height = 67.dp).padding(top = 9.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Icon(
                        imageVector = when (tab) {
                            ClientTab.HOME -> Icons.Default.Home
                            ClientTab.WORKOUTS -> Icons.Default.FitnessCenter
                            ClientTab.LOGS -> Icons.Default.History
                            ClientTab.PROGRESS -> Icons.Default.ShowChart
                            ClientTab.STATS -> Icons.Default.BarChart
                            ClientTab.FOOD -> Icons.Default.Restaurant
                            ClientTab.QUESTIONNAIRE -> Icons.Default.Assignment
                            ClientTab.SESSIONS -> Icons.Default.EventNote
                            ClientTab.SETTINGS -> Icons.Default.Settings
                        },
                        contentDescription = null,
                        tint = if (active) FwbColor.accent else FwbColor.text,
                        modifier = Modifier.size(25.dp),
                    )
                    Text(
                        tab.label,
                        color = if (active) FwbColor.accent else FwbColor.text,
                        fontSize = 10.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
internal fun FwbCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = FwbColor.card,
        border = BorderStroke(1.dp, FwbColor.line),
    ) { Box(Modifier.padding(16.dp)) { content() } }
}

@Composable
internal fun FwbButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = FwbColor.accent, contentColor = Color.Black),
    ) { Text(label, fontWeight = FontWeight.Bold) }
}

@Composable
internal fun PageTitle(kicker: String, title: String) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(kicker.uppercase(), color = FwbColor.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Text(title, color = FwbColor.text, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 34.sp)
    }
}

@Composable
private fun ErrorScreen(message: String, retry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
        Text(message, color = FwbColor.text)
        Spacer(Modifier.height(16.dp))
        FwbButton("Retry", retry)
    }
}

@Composable
private fun InDevelopmentScreen(title: String) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        PageTitle("Android build", title)
        FwbCard {
            Text("This section is being ported from iOS. It is unavailable in this development build.", color = FwbColor.muted)
        }
    }
}
