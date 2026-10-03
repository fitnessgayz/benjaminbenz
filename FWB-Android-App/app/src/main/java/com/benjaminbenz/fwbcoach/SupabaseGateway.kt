package com.benjaminbenz.fwbcoach

import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.json.JsonObject

/** The same public project configuration used by the iOS client. RLS remains authoritative. */
internal object SupabaseGateway {
    private const val projectUrl = "https://qukdfjeupjhpthfbaonv.supabase.co"
    private const val publishableKey = "sb_publishable_qeOpd7yy_l0K2iwm7ri6VA_EqD7NOjy"
    private const val coachEmail = "benjaminbenz.fit@gmail.com"
    private const val resetUrl = "https://benjaminbenz.com/client-invite.html"

    private val client = createSupabaseClient(projectUrl, publishableKey) {
        install(Auth)
        install(Postgrest)
    }

    suspend fun restoreAccount(): ClientAccount? {
        client.auth.awaitInitialization()
        val email = client.auth.currentSessionOrNull()?.user?.email?.trim()?.lowercase()
        if (email.isNullOrEmpty()) return null
        if (email == coachEmail) {
            client.auth.signOut()
            return null
        }
        return ClientAccount(email)
    }

    suspend fun signIn(email: String, password: String): ClientAccount {
        val normalized = email.trim().lowercase()
        require(normalized.isNotEmpty() && password.isNotEmpty()) { "Enter your email and password." }
        client.auth.signInWith(Email) {
            this.email = normalized
            this.password = password
        }
        return restoreAccount() ?: error("Use a client account to sign in. Coach administration is on the website.")
    }

    suspend fun resetPassword(email: String) {
        val normalized = email.trim().lowercase()
        require(normalized.isNotEmpty()) { "Enter your email first." }
        client.auth.resetPasswordForEmail(normalized, redirectUrl = resetUrl)
    }

    suspend fun signOut() = client.auth.signOut()

    suspend fun loadPrograms(account: ClientAccount): List<ClientProgram> {
        val sessionEmail = restoreAccount()?.email ?: error("Sign in again to load your program.")
        require(sessionEmail == account.email) { "This client session changed. Sign in again." }
        val emailPattern = sessionEmail.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        val rows = client.from("client_programs").select {
            filter {
                ilike("client_email", emailPattern)
                eq("active", true)
            }
        }.decodeList<JsonObject>()
        return rows.mapNotNull(JsonObject::toClientProgram)
            .sortedWith(compareByDescending<ClientProgram> { it.updatedAt }.thenByDescending { it.id })
    }
}
