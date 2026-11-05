package site.xiudou.boundarynotes

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import io.noties.markwon.Markwon
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.MarkwonConfiguration
import io.noties.markwon.image.ImagesPlugin
import io.noties.markwon.image.network.NetworkSchemeHandler
import io.noties.markwon.image.destination.ImageDestinationProcessor
import io.noties.markwon.ext.tables.TablePlugin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

fun JSONArray.rows(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
fun JSONObject.text(key: String): String = if (isNull(key)) "" else optString(key)

class BlogModel(application: Application) : AndroidViewModel(application) {
    val api = BlogApi(application)
    var posts by mutableStateOf(emptyList<JSONObject>()); private set
    var article by mutableStateOf<JSONObject?>(null); private set
    var session by mutableStateOf<JSONObject?>(null); private set
    var social by mutableStateOf<JSONObject?>(null); private set
    var messages by mutableStateOf(emptyList<JSONObject>()); private set
    var chat by mutableStateOf<JSONObject?>(null); private set
    var error by mutableStateOf<String?>(null)
    val registration = RegistrationController(api, viewModelScope) { error = it }
    var loginEmailHint by mutableStateOf("")
    var profileNotice by mutableStateOf(""); private set
    var busy by mutableStateOf(false); private set
    var hasMore by mutableStateOf(false); private set
    var foundUsers by mutableStateOf(emptyList<JSONObject>()); private set
    var pendingMfa by mutableStateOf(false); private set
    var restoringSession by mutableStateOf(true); private set
    private var page = 1
    private var search = ""
    init {
        loadPosts("")
        viewModelScope.launch {
            try { acceptSession(api.request("/api/auth/session")) }
            catch (e: CancellationException) { throw e } catch (_: Exception) { }
            finally { restoringSession = false }
        }
    }
    fun task(block: suspend () -> Unit) {
        if (busy) return
        viewModelScope.launch {
            busy = true; error = null
            try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message ?: "网络连接失败" } finally { busy = false }
        }
    }
    fun loadPosts(query: String, more: Boolean = false) = task {
        val next = if (more) page + 1 else 1
        val url = BuildConfig.SITE_URL.toHttpUrl().newBuilder().addPathSegments("api/mobile/posts").addQueryParameter("q", query).addQueryParameter("page", "$next").build()
        val result = api.request(url.encodedPath + "?" + url.encodedQuery)
        posts = ((if (more) posts else emptyList()) + result.getJSONArray("posts").rows()).distinctBy { it.getString("id") }
        hasMore = result.optBoolean("hasMore"); page = next; search = query
    }
    fun more() = loadPosts(search, true)
    fun openPost(post: JSONObject) = task {
        val path = BuildConfig.SITE_URL.toHttpUrl().newBuilder().addPathSegments("api/mobile/posts").addPathSegment(post.getString("slug")).build().encodedPath
        article = api.request(path).getJSONObject("post")
    }
    fun back() { if (registration.isOpen) registration.close() else { article = null; chat = null; messages = emptyList() } }
    fun receiveRegistrationLink(uri: Uri?) {
        if (uri == null) return
        val token = RegistrationLinks.tokenFromUrl(uri.toString(), BuildConfig.SITE_URL)
        if (token == null) { error = "邮箱验证链接无效"; return }
        if (session != null || pendingMfa) { error = "请先退出当前账号再注册"; return }
        registration.open(token)
    }
    private fun acceptSession(value: JSONObject) {
        pendingMfa = value.has("user") && value.optString("authState") == "mfa_pending"
        session = value.takeIf { it.has("user") && it.optString("authState") == "full" }
        if ((session != null || pendingMfa) && registration.isOpen) {
            registration.close()
            error = "请先退出当前账号再注册"
        }
    }
    fun login(email: String, password: String) = task { acceptSession(api.login(email, password)) }
    fun verifyMfa(code: String) = task {
        api.post("/api/mobile/mfa", JSONObject().put("code", code))
        val full = api.request("/api/auth/session")
        if (full.optString("authState") != "full") error("验证尚未完成，请重试")
        acceptSession(full)
    }
    fun logout() = task { try { api.logout() } finally { pendingMfa = false; session = null; social = null; chat = null; messages = emptyList();profileNotice="" } }
    suspend fun refreshSocial(includeMessages: Boolean = true) {
        val currentSession = session ?: return
        val updated = try { api.request("/api/social") } catch (e: LoginRequired) {
            session = null; social = null; chat = null; messages = emptyList(); throw e
        }
        if (session !== currentSession) return
        social = updated
        chat?.takeIf { includeMessages }?.let {
            val id = it.getString("id")
            val updatedMessages = api.request("/api/social/conversations/$id/messages").getJSONArray("messages").rows()
            if (chat?.text("id") == id && session === currentSession) {
                messages = updatedMessages
            }
        }
    }
    fun openChat(item: JSONObject, friend: Boolean) = task {
        val conversation = if (friend) api.post("/api/social/conversations", JSONObject().put("friendId", item.getString("peerId"))) else item
        val id = conversation.getString("id")
        val loaded = api.request("/api/social/conversations/$id/messages").getJSONArray("messages").rows()
        chat = JSONObject().put("id", id).put("peerName", item.getString("peerName")).put("peerImage",item.opt("peerImage")); messages = loaded
    }
    fun send(content: String, done: () -> Unit) = task {
        val id = chat?.getString("id") ?: return@task
        api.post("/api/social/conversations/$id/messages", JSONObject().put("content", content.trim()))
        done(); refreshSocial()
    }
    fun searchUsers(query: String) = task {
        val url = BuildConfig.SITE_URL.toHttpUrl().newBuilder().addPathSegments("api/social/users").addQueryParameter("q", query).build()
        foundUsers = api.request(url.encodedPath + "?" + url.encodedQuery).getJSONArray("users").rows()
    }
    fun friendship(action: String, id: String) = task {
        api.post("/api/social/friendships", JSONObject().put("action", action).put(if (action == "request") "targetId" else "friendshipId", id))
        foundUsers = emptyList(); refreshSocial()
    }
    fun readNotice(id: String) = task { api.post("/api/social/announcements/$id/read", JSONObject()); refreshSocial() }
    suspend fun readVisibleMessage(conversationId: String, messageId: String) {
        if(chat?.text("id") != conversationId || session == null) return
        api.post("/api/social/conversations/$conversationId/read", JSONObject().put("messageId",messageId))
        refreshSocial(includeMessages = false)
    }
    fun changeGroup(body: JSONObject) = task { api.post("/api/social/groups", body); refreshSocial(includeMessages = false) }
    private fun mergeProfile(user:JSONObject){
        session?.let { old->val updated=JSONObject(old.toString());val target=updated.getJSONObject("user")
            listOf("name","image").forEach{target.put(it,user.opt(it))};session=updated
        }
    }
    fun saveProfile(name:String)=task {
        val updated=api.post("/api/mobile/profile",JSONObject().put("name",name)).getJSONObject("user")
        mergeProfile(updated);profileNotice="资料已更新。"
    }
    fun uploadAvatar(uri:Uri)=task {
        val bytes=kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO){
            val stream=getApplication<Application>().contentResolver.openInputStream(uri)?:error("无法读取图片")
            stream.use { input->val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);var n=input.read(buffer)
                while(n>=0){output.write(buffer,0,n);require(output.size()<=2*1024*1024){"头像不能超过 2 MB"};n=input.read(buffer)};output.toByteArray()
            }
        }
        require(bytes.isNotEmpty()){"请选择图片"}
        val mime=getApplication<Application>().contentResolver.getType(uri)?:"application/octet-stream"
        val body=okhttp3.MultipartBody.Builder().setType(okhttp3.MultipartBody.FORM).addFormDataPart("avatar","avatar",bytes.toRequestBody(mime.toMediaType())).build()
        api.request("/api/mobile/avatar",body)
        mergeProfile(api.request("/api/mobile/profile").getJSONObject("user"));profileNotice="头像已更新。"
    }
    fun broadcast(content: String, done: (Int) -> Unit) = task {
        val result = api.post("/api/admin/social/announcements", JSONObject().put("content", content.trim()))
        done(result.optInt("recipientCount"))
    }
}

class MainActivity : ComponentActivity() {
    private val blogModel by lazy { ViewModelProvider(this)[BlogModel::class.java] }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); enableEdgeToEdge()
        handleRegistrationIntent(intent)
        val appearance=getSharedPreferences("appearance",MODE_PRIVATE)
        setContent {
            var mode by rememberSaveable{mutableStateOf(appearance.getString("theme","system")?:"system")}
            val dark=when(mode){"dark"->true;"light"->false;else->isSystemInDarkTheme()}
            SideEffect{androidx.core.view.WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=!dark;isAppearanceLightNavigationBars=!dark}}
            SiteTheme(dark){BlogApp(blogModel,dark){mode=if(dark)"light" else "dark";appearance.edit().putString("theme",mode).apply()}}
        }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handleRegistrationIntent(intent) }
    private fun handleRegistrationIntent(intent: Intent) { blogModel.receiveRegistrationLink(intent.data); intent.data = null }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun BlogApp(model: BlogModel = viewModel(),dark:Boolean=false,onToggleTheme:()->Unit={}) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val owner = LocalLifecycleOwner.current
    val context = LocalContext.current
    LaunchedEffect(owner, tab, model.session, model.chat?.text("id")) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (model.session != null) {
                try { model.refreshSocial(includeMessages = tab == 1) } catch (e: CancellationException) { throw e } catch (e: Exception) { model.error = e.message }
                delay(if (tab == 1) 8000 else 20000)
            }
        }
    }
    BackHandler(model.article != null || model.chat != null || model.registration.isOpen) { model.back() }
    Scaffold(topBar = {Column {
        TopAppBar(colors=TopAppBarDefaults.topAppBarColors(containerColor=MaterialTheme.colorScheme.background),title = {
            if(model.article==null&&model.chat==null&&!model.registration.isOpen)SiteBrand(compact=true)
            else Text(if(model.registration.isOpen)"注册账号" else if(model.article!=null)"文章" else model.chat?.text("peerName")?:"边界笔记",style=MaterialTheme.typography.titleMedium,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        },
            navigationIcon = { if (model.article != null || model.chat != null || model.registration.isOpen) TextButton(onClick = { model.back() }, enabled = !model.registration.busy) { Text("返回") } },
            actions = {
                IconButton(onClick=onToggleTheme){Icon(painterResource(if(dark)R.drawable.ic_sun else R.drawable.ic_moon),contentDescription=if(dark)"切换浅色模式" else "切换深色模式",modifier=Modifier.size(20.dp))}
                model.article?.let { post ->
                    TextButton(onClick = {
                        val url = BuildConfig.SITE_URL.toHttpUrl().newBuilder().addPathSegment("posts").addPathSegment(post.getString("slug")).build()
                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url.toString()), "分享文章"))
                    }) { Text("分享") }
                }
            })
        HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
    }}, bottomBar = { if (model.article == null && model.chat == null && !model.registration.isOpen) SiteBottomNavigation(tab,model.social?.optInt("unread")?:0){tab=it} }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (model.busy || model.registration.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            model.error?.let { text -> Surface(color = MaterialTheme.colorScheme.errorContainer,shape=androidx.compose.foundation.shape.RoundedCornerShape(8.dp),border=androidx.compose.foundation.BorderStroke(1.dp,MaterialTheme.colorScheme.error.copy(alpha=.3f)),modifier=Modifier.padding(horizontal=20.dp,vertical=8.dp)) {
                Row(Modifier.fillMaxWidth().padding(12.dp)) { Text(text, Modifier.weight(1f)); TextButton(onClick = { model.error = null }) { Text("关闭") } }
            } }
            when {
                model.registration.isOpen && !model.restoringSession -> RegistrationScreen(model) { model.loginEmailHint = model.registration.email; model.registration.close(); tab = 2 }
                model.registration.isOpen -> AccountScreen(model)
                model.article != null -> ArticleScreen(model.article!!)
                model.chat != null -> ChatScreen(model)
                tab == 0 -> PostsScreen(model)
                tab == 1 && model.session != null -> SocialScreen(model)
                else -> AccountScreen(model)
            }
        }
    }
}
