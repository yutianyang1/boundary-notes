package site.xiudou.boundarynotes

import android.os.SystemClock
import androidx.compose.runtime.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject

class RegistrationController(private val api: BlogApi, private val scope: CoroutineScope, private val onError: (String?) -> Unit) {
    var isOpen by mutableStateOf(false); private set
    var enabled by mutableStateOf<Boolean?>(null); private set
    var loading by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var stage by mutableIntStateOf(0); private set
    var email by mutableStateOf(""); private set
    var emailHint by mutableStateOf(""); private set
    var notice by mutableStateOf(""); private set
    var cooldownUntil by mutableLongStateOf(0); private set
    var tokenReady by mutableStateOf(false); private set
    var existingAccount by mutableStateOf(false); private set
    private var token = ""

    fun open(linkToken: String? = null) {
        if (busy) return
        isOpen = true; notice = ""; existingAccount = false
        token = linkToken.orEmpty(); tokenReady = token.isNotBlank()
        if (linkToken != null) { email = ""; emailHint = "" }
        stage = if (tokenReady) 1 else 0
        refreshConfig()
    }
    fun close() {
        if (busy) return
        isOpen = false; stage = 0; token = ""; tokenReady = false; notice = ""
    }
    fun refreshConfig() {
        if (loading) return
        loading = true
        scope.launch {
            try { enabled = api.request("/api/mobile/registration").getBoolean("enabled") }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { enabled = null; onError(e.message) }
            finally { loading = false }
        }
    }
    private fun act(block: suspend () -> Unit) {
        if (busy || enabled != true) return
        busy = true; onError(null)
        scope.launch {
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: ApiFailure) {
                if (e.cooldownSeconds > 0) cooldownUntil = SystemClock.elapsedRealtime() + e.cooldownSeconds * 1000L
                onError(e.message)
            }
            catch (e: Exception) { onError(e.message ?: "注册暂时失败，请重试") }
            finally { busy = false }
        }
    }
    fun requestEmail(input: String = email, resend: Boolean = false) = act {
        val result = api.post("/api/mobile/registration", JSONObject().put("action", "request").put("email", input.trim()).put("resend", resend))
        email = result.optString("email", input.trim()); emailHint = result.optString("emailHint", email)
        notice = result.text("notice"); token = ""; tokenReady = false; stage = 1
        cooldownUntil = SystemClock.elapsedRealtime() + result.optInt("cooldownSeconds", 60).coerceIn(0, 3600) * 1000L
    }
    fun verifyLink(input: String) {
        val value = input.trim()
        val proof = if (value.isBlank()) token else if (RegistrationLinks.isToken(value)) value else RegistrationLinks.tokenFromUrl(value, BuildConfig.SITE_URL)
        if (proof.isNullOrBlank()) { onError("请粘贴本站邮件中的完整验证链接"); return }
        act {
            val result = api.post("/api/mobile/registration", JSONObject().put("action", "verify").put("token", proof))
            if (result.optString("stage") == "already_registered") {
                existingAccount = true; token = ""; tokenReady = false; stage = 3
            } else {
                check(result.optString("stage") == "verified") { "邮箱验证未完成，请重试" }
                token = proof; tokenReady = true; email = result.getString("email"); stage = 2; notice = ""
            }
        }
    }
    fun complete(name: String, password: String, confirm: String, clearPassword: () -> Unit) {
        if (password != confirm) { onError("两次密码不一致"); return }
        if (password.length < 8 || password.length > 1024) { onError("密码需为 8 至 1024 个字符"); return }
        act {
            val result = api.post("/api/mobile/registration", JSONObject().put("action", "complete").put("token", token)
                .put("name", name.trim()).put("password", password).put("confirmPassword", confirm))
            check(result.optString("stage") == "registered") { "注册未完成，请重试" }
            token = ""; tokenReady = false; stage = 3; existingAccount = false; clearPassword()
        }
    }
}
