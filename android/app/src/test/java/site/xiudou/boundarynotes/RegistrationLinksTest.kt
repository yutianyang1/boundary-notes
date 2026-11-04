package site.xiudou.boundarynotes

import org.junit.Assert.*
import org.junit.Test

class RegistrationLinksTest {
    private val origin = "https://xiudou.site"
    private val token = "A_test-token_" + "x".repeat(31)
    @Test fun acceptsWebsiteVerificationAndCompletionLinks() {
        for (path in listOf("/verify-email", "/en/verify-email", "/register/complete", "/en/register/complete")) {
            assertEquals(token, RegistrationLinks.tokenFromUrl("$origin$path?token=$token", origin))
        }
    }
    @Test fun rejectsUntrustedAndAmbiguousLinks() {
        for (url in listOf(
            "http://xiudou.site/verify-email?token=$token",
            "https://xiudou.site.evil.example/verify-email?token=$token",
            "https://someone@xiudou.site/verify-email?token=$token",
            "https://xiudou.site:444/verify-email?token=$token",
            "$origin/posts/test?token=$token",
            "$origin/verify-email?token=$token&token=other",
            "$origin/verify-email?token=$token#fragment",
            "$origin/verify-email?token=short",
            "$origin/verify-email?token=${"x".repeat(257)}",
            "$origin/verify-email?token=%ZZ",
            "$origin/verify-email?token=%2F${token}",
            "$origin/verify-email",
        )) assertNull(url, RegistrationLinks.tokenFromUrl(url, origin))
    }
}
