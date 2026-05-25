package com.TheVoteApp.data.zk

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import com.TheVoteApp.domain.model.ZkProof
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * ZKProver — client-side Groth16 proof generation via snarkjs WASM.
 *
 * Runs snarkjs inside a hidden WebView backed by bundled circuit artifacts
 * (vote_eligibility.wasm + vote_eligibility_final.zkey in assets/zk/).
 *
 * The private key never leaves the device and the proof is generated
 * entirely on-device — no server trust required for vote privacy.
 */
@Singleton
class ZKProver @Inject constructor(
    @ApplicationContext private val context: Context
) {

    /**
     * Generate a Groth16 ZK proof of vote eligibility.
     *
     * @param nullifier  32-byte voter nullifier (hex string)
     * @param secret     32-byte voter secret (hex string, never transmitted)
     * @param merkleRoot Merkle root of the voter registry commitment set
     * @param merklePath Merkle inclusion path as list of hex strings
     * @param policyId   Policy being voted on
     */
    suspend fun prove(
        nullifier: String,
        secret: String,
        merkleRoot: String,
        merklePath: List<String>,
        policyId: String
    ): ZkProof = suspendCancellableCoroutine { continuation ->
        // WebView must be created on main thread
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            val webView = buildProverWebView(context) { result ->
                runCatching {
                    val json = JSONObject(result)
                    val proofObj = json.getJSONObject("proof")
                    val signals = json.getJSONArray("publicSignals")

                    ZkProof(
                        pi_a = proofObj.getJSONArray("pi_a").toStringList(),
                        pi_b = proofObj.getJSONArray("pi_b").let { outer ->
                            (0 until outer.length()).map { outer.getJSONArray(it).toStringList() }
                        }.flatten(),
                        pi_c = proofObj.getJSONArray("pi_c").toStringList(),
                        publicSignals = signals.toStringList()
                    )
                }.fold(
                    onSuccess = { continuation.resume(it) },
                    onFailure = { continuation.resumeWithException(it) }
                )
            } onError@{ err ->
                continuation.resumeWithException(ZKProverException(err))
            }

            continuation.invokeOnCancellation { webView.destroy() }

            webView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    val inputs = JSONObject().apply {
                        put("nullifier", nullifier)
                        put("secret", secret)
                        put("merkleRoot", merkleRoot)
                        put("merklePath", JSONArray(merklePath))
                        put("policyId", policyId)
                    }
                    val msg = JSONObject().apply {
                        put("type", "prove")
                        put("inputs", inputs)
                    }.toString().replace("'", "\\'")
                    view.evaluateJavascript("window.receiveMessage('$msg')", null)
                }
            }

            webView.loadUrl("file:///android_asset/zk/prover_worker.html")
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun buildProverWebView(
        context: Context,
        onResult: (String) -> Unit,
        onError: (String) -> Unit
    ): WebView {
        val webView = WebView(context)
        webView.settings.javaScriptEnabled = true
        webView.settings.allowFileAccessFromFileURLs = true
        webView.addJavascriptInterface(
            object {
                @JavascriptInterface fun onProofReady(json: String) = onResult(json)
                @JavascriptInterface fun onProofError(msg: String) = onError(msg)
            },
            "ProverCallback"
        )
        return webView
    }

    private fun JSONArray.toStringList(): List<String> =
        (0 until length()).map { getString(it) }
}

class ZKProverException(message: String) : Exception("ZK proof generation failed: $message")
