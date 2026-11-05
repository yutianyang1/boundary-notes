package site.xiudou.boundarynotes
import org.junit.Assert.assertEquals
import org.junit.Test

class CoverPatternTest {
    @Test fun agreesWithWebsiteSeedsIncludingUnicode() {
        assertEquals(2367946963u,coverHash("motif:architecture"))
        assertEquals(2781466111u,coverHash("hue:hello-world"))
        assertEquals(87774914u,coverHash("focus:hello-world"))
        assertEquals(75634546u,coverHash("motif:边界笔记"))
    }
}
