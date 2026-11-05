package site.xiudou.boundarynotes

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.KeyStore
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class LoginRequired : java.io.IOException("登录已失效，请重新登录")
class ApiFailure(message: String, val status: Int, val cooldownSeconds: Int = 0) : java.io.IOException(message)

class SecureCookies(context: Context) : CookieJar {
    private val preferences = context.getSharedPreferences("session", Context.MODE_PRIVATE)
    private val origin = BuildConfig.SITE_URL.toHttpUrl()
    private val cookies = mutableListOf<Cookie>()
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey("blog-session", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("blog-session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    init {
        runCatching {
            val packed = Base64.decode(preferences.getString("cookies", null) ?: return@runCatching, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, packed.copyOfRange(0, 12)))
            String(cipher.doFinal(packed.copyOfRange(12, packed.size))).lines().mapNotNull { Cookie.parse(origin, it) }.forEach(cookies::add)
        }.onFailure { preferences.edit().clear().apply() }
    }
    @Synchronized override fun saveFromResponse(url: HttpUrl, received: List<Cookie>) {
        if (url.host != origin.host) return
        received.forEach { new -> cookies.removeAll { it.name == new.name && it.path == new.path && it.domain == new.domain }; cookies.add(new) }
        cookies.removeAll { it.expiresAt <= System.currentTimeMillis() }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.iv + cipher.doFinal(cookies.joinToString("\n").toByteArray())
        preferences.edit().putString("cookies", Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> = cookies.filter { it.matches(url) && it.expiresAt > System.currentTimeMillis() }
    @Synchronized fun clear() { cookies.clear(); preferences.edit().clear().apply() }
}

class BlogApi(context: Context) {
    private val jar = SecureCookies(context)
    private val origin = BuildConfig.SITE_URL.toHttpUrl()
    private val client = OkHttpClient.Builder().cookieJar(jar).callTimeout(25, TimeUnit.SECONDS)
        .followRedirects(false).build()
    suspend fun request(path: String, body: RequestBody? = null): JSONObject = withContext(Dispatchers.IO) {
        val url = origin.resolve(path) ?: error("地址无效")
        require(url.host == origin.host && url.scheme == "https")
        val builder = Request.Builder().url(url).header("Accept", "application/json").header("Origin", BuildConfig.SITE_URL).header("X-Auth-Return-Redirect", "1")
            .header("User-Agent", "BoundaryNotes-Android/${BuildConfig.VERSION_NAME}")
        if (body != null) builder.post(body)
        client.newCall(builder.build()).execute().use { response ->
            if (response.code == 401) throw LoginRequired()
            if (response.isSuccessful && response.code == 204) return@use JSONObject()
            val raw = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(raw) }.getOrElse { error("服务返回了无法识别的内容（${response.code}）") }
            if (!response.isSuccessful) throw ApiFailure(json.optString("error", "请求失败（${response.code}）"), response.code, json.optInt("cooldownSeconds").coerceIn(0, 3600))
            json
        }
    }
    suspend fun post(path: String, json: JSONObject) = request(path, json.toString().toRequestBody("application/json".toMediaType()))
    private suspend fun form(path: String, fields: Map<String, String>) = request(path, FormBody.Builder().apply { fields.forEach { (k, v) -> add(k, v) } }.build())
    suspend fun login(email: String, password: String): JSONObject {
        val csrf = request("/api/auth/csrf").getString("csrfToken")
        val result = form("/api/auth/callback/credentials", mapOf("csrfToken" to csrf, "email" to email.trim(), "password" to password, "callbackUrl" to BuildConfig.SITE_URL, "json" to "true"))
        if (result.optString("url").contains("error=")) error("邮箱或密码错误，或账号尚未完成验证")
        val session = request("/api/auth/session")
        if (!session.has("user")) error("登录未成功，请重试")
        if (session.optString("authState") == "mfa_enrollment_required") {
            logout()
            error("此账号需要先在网站上绑定验证器，再登录 App")
        }
        return session
    }
    suspend fun logout() {
        try {
            val csrf = request("/api/auth/csrf").getString("csrfToken")
            form("/api/auth/signout", mapOf("csrfToken" to csrf, "callbackUrl" to BuildConfig.SITE_URL, "json" to "true"))
        } finally { jar.clear() }
    }
}
