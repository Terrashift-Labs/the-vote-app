package com.TheVoteApp.data.auth

import android.app.Activity
import android.util.Base64
import com.TheVoteApp.data.remote.VoteApiClient
import com.google.android.gms.fido.Fido
import com.google.android.gms.fido.fido2.api.common.AuthenticatorAssertionResponse
import com.google.android.gms.fido.fido2.api.common.AuthenticatorAttestationResponse
import com.google.android.gms.fido.fido2.api.common.AuthenticatorSelectionCriteria
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredential
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredentialCreationOptions
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredentialDescriptor
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredentialParameters
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredentialRequestOptions
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredentialRpEntity
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredentialType
import com.google.android.gms.fido.fido2.api.common.PublicKeyCredentialUserEntity
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * FIDO2Service — Android FIDO2 API integration for hardware security keys.
 *
 * Supports both platform authenticators (fingerprint/face) and
 * roaming authenticators (USB/NFC FIDO2 security keys such as YubiKey).
 *
 * Flow:
 *   Registration:
 *     1. POST /api/v1/fido2/register/options  → server challenge
 *     2. Android FIDO2 API creates credential on authenticator
 *     3. POST /api/v1/fido2/register/verify   → server stores credential
 *
 *   Authentication:
 *     1. POST /api/v1/fido2/authenticate/options → server challenge
 *     2. Android FIDO2 API signs challenge on authenticator
 *     3. POST /api/v1/fido2/authenticate/verify  → server verifies signature
 */
@Singleton
class FIDO2Service @Inject constructor(
    private val apiClient: VoteApiClient
) {

    // MARK: - Registration

    /**
     * Start credential registration. Returns a PendingIntent to launch the
     * FIDO2 authenticator UI. Call startIntentSenderForResult() with this.
     */
    suspend fun startRegistration(
        activity: Activity,
        userId: String,
        displayName: String
    ): android.content.IntentSender {
        val options = apiClient.post(
            "/api/v1/fido2/register/options",
            mapOf("userId" to userId, "displayName" to displayName)
        )

        val creationOptions = buildCreationOptions(options, userId, displayName)
        val fido2Client = Fido.getFido2ApiClient(activity)
        val task = fido2Client.getRegisterPendingIntent(creationOptions)
        return task.await().intentSender
    }

    /**
     * Complete registration after the FIDO2 UI returns.
     * Pass the credential from the activity result intent.
     */
    suspend fun finishRegistration(
        userId: String,
        credential: PublicKeyCredential
    ): String {
        val attestation = credential.response as? AuthenticatorAttestationResponse
            ?: throw FIDO2Exception("Unexpected credential response type")

        val responseJson = JSONObject().apply {
            put("id", credential.id)
            put("rawId", Base64.encodeToString(credential.rawId, Base64.URL_SAFE or Base64.NO_PADDING))
            put("type", credential.type)
            put("response", JSONObject().apply {
                put("clientDataJSON", Base64.encodeToString(
                    attestation.clientDataJSON, Base64.URL_SAFE or Base64.NO_PADDING))
                put("attestationObject", Base64.encodeToString(
                    attestation.attestationObject, Base64.URL_SAFE or Base64.NO_PADDING))
            })
        }

        val result = apiClient.post(
            "/api/v1/fido2/register/verify",
            mapOf("userId" to userId, "response" to responseJson.toMap())
        )
        return result["credentialId"] as? String
            ?: throw FIDO2Exception("No credentialId in registration response")
    }

    // MARK: - Authentication

    /**
     * Start authentication. Returns a PendingIntent for the FIDO2 authenticator UI.
     */
    suspend fun startAuthentication(
        activity: Activity,
        userId: String
    ): android.content.IntentSender {
        val options = apiClient.post(
            "/api/v1/fido2/authenticate/options",
            mapOf("userId" to userId)
        )

        val requestOptions = buildRequestOptions(options)
        val fido2Client = Fido.getFido2ApiClient(activity)
        val task = fido2Client.getSignPendingIntent(requestOptions)
        return task.await().intentSender
    }

    /**
     * Complete authentication after the FIDO2 UI returns.
     */
    suspend fun finishAuthentication(
        userId: String,
        credential: PublicKeyCredential
    ): Boolean {
        val assertion = credential.response as? AuthenticatorAssertionResponse
            ?: throw FIDO2Exception("Unexpected credential response type")

        val responseJson = JSONObject().apply {
            put("id", credential.id)
            put("rawId", Base64.encodeToString(credential.rawId, Base64.URL_SAFE or Base64.NO_PADDING))
            put("type", credential.type)
            put("response", JSONObject().apply {
                put("clientDataJSON", Base64.encodeToString(
                    assertion.clientDataJSON, Base64.URL_SAFE or Base64.NO_PADDING))
                put("authenticatorData", Base64.encodeToString(
                    assertion.authenticatorData, Base64.URL_SAFE or Base64.NO_PADDING))
                put("signature", Base64.encodeToString(
                    assertion.signature, Base64.URL_SAFE or Base64.NO_PADDING))
                assertion.userHandle?.let {
                    put("userHandle", Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_PADDING))
                }
            })
        }

        val result = apiClient.post(
            "/api/v1/fido2/authenticate/verify",
            mapOf("userId" to userId, "response" to responseJson.toMap())
        )
        return result["verified"] as? Boolean ?: false
    }

    // MARK: - Private builders

    @Suppress("UNCHECKED_CAST")
    private fun buildCreationOptions(
        serverOptions: Map<String, Any?>,
        userId: String,
        displayName: String
    ): PublicKeyCredentialCreationOptions {
        val challenge = Base64.decode(
            serverOptions["challenge"] as String, Base64.URL_SAFE or Base64.NO_PADDING)

        val rp = serverOptions["rp"] as? Map<String, Any?> ?: emptyMap()
        val rpEntity = PublicKeyCredentialRpEntity(
            rp["id"] as? String ?: "localhost",
            rp["name"] as? String ?: "TheVoteApp",
            null
        )
        val userEntity = PublicKeyCredentialUserEntity(
            userId.toByteArray(),
            userId,
            displayName
        )

        val pubKeyParams = listOf(
            PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY.toString(), -7), // ES256
            PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY.toString(), -257) // RS256
        )

        return PublicKeyCredentialCreationOptions.Builder()
            .setRp(rpEntity)
            .setUser(userEntity)
            .setChallenge(challenge)
            .setParameters(pubKeyParams)
            .setTimeoutSeconds(60.0)
            .setAuthenticatorSelection(
                AuthenticatorSelectionCriteria.Builder()
                    .setRequireResidentKey(false)
                    .build()
            )
            .build()
    }

    @Suppress("UNCHECKED_CAST")
    private fun buildRequestOptions(serverOptions: Map<String, Any?>): PublicKeyCredentialRequestOptions {
        val challenge = Base64.decode(
            serverOptions["challenge"] as String, Base64.URL_SAFE or Base64.NO_PADDING)

        val allowCredentials = (serverOptions["allowCredentials"] as? List<Map<String, Any?>>)
            ?.map { cred ->
                PublicKeyCredentialDescriptor(
                    PublicKeyCredentialType.PUBLIC_KEY.toString(),
                    Base64.decode(cred["id"] as String, Base64.URL_SAFE or Base64.NO_PADDING),
                    null
                )
            } ?: emptyList()

        return PublicKeyCredentialRequestOptions.Builder()
            .setChallenge(challenge)
            .setAllowList(allowCredentials)
            .setRpId(serverOptions["rpId"] as? String ?: "localhost")
            .setTimeoutSeconds(60.0)
            .build()
    }

    private fun JSONObject.toMap(): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        keys().forEach { key -> map[key] = get(key) }
        return map
    }
}

class FIDO2Exception(message: String) : Exception(message)
