package site.xiudou.boundarynotes

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.json.JSONObject
import java.io.File
import android.graphics.Bitmap

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],qualifiers="w393dp-h852dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SiteAppearanceTest {
    @get:Rule val compose=createComposeRule()
    @Test fun lightAndDarkScreens() {
        var dark by mutableStateOf(false);var screen by mutableIntStateOf(0)
        val post=JSONObject().put("title","在复杂系统中，寻找清晰的边界").put("summary","记录软件架构、工程实践与那些值得反复推敲的设计决定。").put("authorName","秀逗").put("publishedAt","2026-11-05T08:00:00Z")
        val user=JSONObject().put("name","秀逗").put("email","reader@example.com").put("role","reader")
        compose.setContent{SiteTheme(dark){Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background){
            when(screen){
                0->Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){SiteBrand();PageHeading("WRITING / 写作","文章","记录软件架构、工程实践与设计思考。");SiteField("",{},placeholder={Text("搜索文章…")},singleLine=true);PostCard(post){};PostCard(post.put("title","让工程实践回到问题本身")){} }
                1->AccountProfile(user,false,{})
                2->AuthFrame("欢迎回来","登录边界笔记，继续阅读与交流。"){SiteBrand();SiteField("reader@example.com",{},label={Text("邮箱")},singleLine=true);SiteField("",{},label={Text("密码")},singleLine=true);SiteButton({},Modifier.fillMaxWidth()){Text("登录")};TextButton({}){Text("注册账号")}}
                3->Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){PageHeading("CONNECT / 连接","好友与消息");SocialTabs(0,listOf(2,1,3)){};ChatBubble(JSONObject().put("content","这次的文章很有启发，想和你聊聊。").put("createdAt","2026-11-05T08:00:00Z"),false,"小明");ChatBubble(JSONObject().put("content","好呀，我们从架构设计开始聊。").put("createdAt","2026-11-05T08:01:00Z"),true,"");EmptyCard("暂时没有更多消息","与好友的交流，从这里继续。")}
                else->AuthFrame("注册账号","验证邮箱，开启你的阅读与交流。"){RegistrationSteps(1);Text("检查你的邮箱",style=MaterialTheme.typography.titleLarge);SiteField("",{},label={Text("邮箱验证链接")});SiteButton({},Modifier.fillMaxWidth()){Text("验证邮箱并继续")}}
            }
        }}}
        for(night in listOf(false,true))for(index in 0..4){
            compose.runOnIdle{dark=night;screen=index};compose.waitForIdle()
            if(index==1){compose.onNodeWithText("reader@example.com").assertIsDisplayed();compose.onNodeWithText("退出登录").performScrollTo().assertIsDisplayed();compose.onNodeWithText("个人中心").performScrollTo()}
            if(index==2)compose.onNodeWithText("登录",useUnmergedTree=true).assertIsDisplayed()
            val bitmap=compose.onRoot().captureToImage().asAndroidBitmap()
            val file=File("build/site-previews/${if(night)"dark" else "light"}-$index.png");file.parentFile?.mkdirs()
            file.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
        }
    }
}
