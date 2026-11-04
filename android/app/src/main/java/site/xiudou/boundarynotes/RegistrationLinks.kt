package site.xiudou.boundarynotes

import java.net.URI
import java.net.URLDecoder

object RegistrationLinks {
    fun isToken(value: String) = value.matches(Regex("[A-Za-z0-9_-]{20,256}"))
    fun tokenFromUrl(value: String, origin: String): String? = runCatching {
        if (value.length > 2048) return@runCatching null
        val uri = URI(value.trim())
        val site = URI(origin)
        val paths = setOf("/verify-email", "/en/verify-email", "/register/complete", "/en/register/complete")
        if (!uri.scheme.equals("https", ignoreCase = true) || !uri.host.equals(site.host, ignoreCase = true) || uri.userInfo != null || uri.fragment != null) return@runCatching null
        if ((if (uri.port == -1) 443 else uri.port) != (if (site.port == -1) 443 else site.port) || uri.path !in paths) return@runCatching null
        val values = uri.rawQuery.orEmpty().split('&').map { it.split('=', limit = 2) }
            .filter { URLDecoder.decode(it[0], "UTF-8") == "token" }
        if (values.size != 1 || values[0].size != 2) return@runCatching null
        URLDecoder.decode(values[0][1], "UTF-8").takeIf(::isToken)
    }.getOrNull()
}
