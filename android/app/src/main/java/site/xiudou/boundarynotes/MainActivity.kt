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
    fun logout() = task { try { api.logout() } finally { pendingMfa = false; session = null; social = null; chat = null; messages = emptyList() } }
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
        chat = JSONObject().put("id", id).put("peerName", item.getString("peerName")); messages = loaded
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
        setContent { MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) { BlogApp(blogModel) } }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handleRegistrationIntent(intent) }
    private fun handleRegistrationIntent(intent: Intent) { blogModel.receiveRegistrationLink(intent.data); intent.data = null }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun BlogApp(model: BlogModel = viewModel()) {
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
    Scaffold(topBar = {
        TopAppBar(title = { Text(if (model.registration.isOpen) "注册账号" else model.article?.text("title") ?: model.chat?.text("peerName") ?: "边界笔记") },
            navigationIcon = { if (model.article != null || model.chat != null || model.registration.isOpen) TextButton(onClick = { model.back() }, enabled = !model.registration.busy) { Text("返回") } },
            actions = {
                model.article?.let { post ->
                    TextButton(onClick = {
                        val url = BuildConfig.SITE_URL.toHttpUrl().newBuilder().addPathSegment("posts").addPathSegment(post.getString("slug")).build()
                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url.toString()), "分享文章"))
                    }) { Text("分享") }
                }
            })
    }, bottomBar = { if (model.article == null && model.chat == null && !model.registration.isOpen) NavigationBar {
        listOf("阅读", "消息", "我的").forEachIndexed { index, title ->
            NavigationBarItem(selected = tab == index, onClick = { tab = index }, icon = {
                BadgedBox(badge = { val unread = model.social?.optInt("unread") ?: 0; if (index == 1 && unread > 0) Badge { Text(if (unread > 99) "99+" else "$unread") } }) {
                    Icon(painterResource(listOf(R.drawable.ic_read, R.drawable.ic_chat, R.drawable.ic_person)[index]), title)
                }
            }, label = { Text(title) })
        }
    } }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (model.busy || model.registration.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            model.error?.let { text -> Surface(color = MaterialTheme.colorScheme.errorContainer) {
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

@Composable fun PostsScreen(model: BlogModel) {
    var query by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(query, { query = it }, Modifier.weight(1f), label = { Text("搜索文章") }, singleLine = true)
            Button(onClick = { model.loadPosts(query) }, enabled = !model.busy, modifier = Modifier.padding(top = 8.dp)) { Text("搜索") }
        }
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (model.posts.isEmpty() && !model.busy) item { Text("暂无文章，点击搜索刷新。") }
            items(model.posts, key = { it.getString("id") }) { post ->
                ElevatedCard(onClick = { model.openPost(post) }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(post.text("title"), style = MaterialTheme.typography.titleLarge)
                        if (post.text("summary").isNotBlank()) Text(post.text("summary"), maxLines = 3, style = MaterialTheme.typography.bodyMedium)
                        Text(post.text("authorName") + " · " + post.text("publishedAt").take(10), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
            if (model.hasMore) item { TextButton(onClick = { model.more() }, enabled = !model.busy) { Text("加载更多") } }
        }
    }
}

@Composable fun ArticleScreen(post: JSONObject) {
    val context = LocalContext.current
    val markwon = remember { Markwon.builder(context).usePlugin(TablePlugin.create(context)).usePlugin(ImagesPlugin.create().addSchemeHandler(NetworkSchemeHandler.create()))
        .usePlugin(object : AbstractMarkwonPlugin() {
            override fun configureConfiguration(builder: MarkwonConfiguration.Builder) {
                builder.imageDestinationProcessor(object : ImageDestinationProcessor() {
                    override fun process(destination: String): String {
                        val resolved = BuildConfig.SITE_URL.toHttpUrl().resolve(destination)
                        return if (resolved?.scheme == "https") resolved.toString() else ""
                    }
                })
            }
        }).build() }
    val color = MaterialTheme.colorScheme.onBackground
    val textColor = android.graphics.Color.argb((color.alpha * 255).toInt(), (color.red * 255).toInt(), (color.green * 255).toInt(), (color.blue * 255).toInt())
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text(post.text("title"), style = MaterialTheme.typography.headlineMedium) }
        item { Text(post.text("authorName") + " · " + post.text("publishedAt").take(10), style = MaterialTheme.typography.labelLarge) }
        item { AndroidView(factory = { TextView(it).apply { textSize = 18f; setLineSpacing(8f, 1.15f); setTextIsSelectable(true) } },
            update = { it.setTextColor(textColor); markwon.setMarkdown(it, post.text("contentMd")) }, modifier = Modifier.fillMaxWidth()) }
    }
}

@Composable fun SocialScreen(model: BlogModel) {
    val data = model.social
    var query by rememberSaveable { mutableStateOf("") }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { TextButton(onClick = { model.task { model.refreshSocial() } }, enabled = !model.busy) { Text("刷新消息") } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(query, { query = it }, Modifier.weight(1f), label = { Text("好友 ID、昵称或邮箱") }, singleLine = true)
            TextButton(onClick = { model.searchUsers(query) }, enabled = query.isNotBlank() && !model.busy) { Text("查找") }
        } }
        items(model.foundUsers, key = { "user:" + it.getString("id") }) { user -> ListItem(headlineContent = { Text(user.text("name")) },
            supportingContent = { Text(user.text("publicId")) }, trailingContent = { TextButton(onClick = { model.friendship("request", user.getString("id")) }, enabled = !model.busy) { Text("添加") } }) }
        items(data?.optJSONArray("requests")?.rows().orEmpty(), key = { "request:" + it.getString("id") }) { request ->
            ListItem(headlineContent = { Text(request.text("peerName")) }, supportingContent = { Text(if (request.text("direction") == "incoming") "希望添加你为好友" else "等待对方接受") },
                trailingContent = { if (request.text("direction") == "incoming") Row {
                    TextButton(onClick = { model.friendship("accept", request.getString("id")) }, enabled = !model.busy) { Text("接受") }
                    TextButton(onClick = { model.friendship("reject", request.getString("id")) }, enabled = !model.busy) { Text("拒绝") }
                } })
        }
        if (data == null) item { Text("正在读取消息…") }
        data?.optJSONArray("announcements")?.rows()?.let { announcements ->
            if (announcements.isNotEmpty()) item { Text("站内通知", style = MaterialTheme.typography.titleMedium) }
            items(announcements, key = { "notice:" + it.getString("id") }) { notice -> ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) { Text(notice.text("content")); Text(notice.text("createdAt").take(10), style = MaterialTheme.typography.labelSmall)
                    if (notice.isNull("readAt")) TextButton(onClick = { model.readNotice(notice.getString("id")) }, enabled = !model.busy) { Text("标记已读") }
                }
            } }
        }
        item { Text("会话", style = MaterialTheme.typography.titleMedium) }
        items(data?.optJSONArray("conversations")?.rows().orEmpty(), key = { "chat:" + it.getString("id") }) { conversation ->
            ListItem(headlineContent = { Text(conversation.text("peerName")) }, supportingContent = { Text(conversation.text("latestContent"), maxLines = 1) },
                trailingContent = { if (conversation.optInt("unreadCount") > 0) Badge { Text("${conversation.optInt("unreadCount")}") } }, modifier = Modifier.clickable { model.openChat(conversation, false) })
        }
        item { Text("好友", style = MaterialTheme.typography.titleMedium) }
        item { FriendGroupsPanel(model) }
    }
}

@Composable fun ChatScreen(model: BlogModel) {
    var input by rememberSaveable(model.chat?.text("id")) { mutableStateOf("") }
    val selfId = model.session?.optJSONObject("user")?.text("id")
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val chatId = model.chat?.text("id") ?: ""
    var followEnd by remember(chatId) { mutableStateOf(true) }
    LaunchedEffect(model.messages.lastOrNull()?.text("id")) {
        if (followEnd && model.messages.isNotEmpty()) listState.scrollToItem(model.messages.lastIndex)
    }
    LaunchedEffect(chatId, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            var acknowledged = ""
            while(true) {
                val last = model.messages.lastOrNull()?.text("id")
                val info = listState.layoutInfo
                val latestVisible = info.visibleItemsInfo.lastOrNull()?.let { it.key == last && it.offset + it.size <= info.viewportEndOffset } == true
                followEnd = !listState.canScrollForward
                if(latestVisible && last != null && last != acknowledged) {
                    try { model.readVisibleMessage(chatId,last); acknowledged = last }
                    catch(e: CancellationException) { throw e } catch(e: Exception) { model.error = e.message }
                }
                delay(500)
            }
        }
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(state = listState, modifier = Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(model.messages, key = { it.getString("id") }) { message ->
                val mine = message.text("senderId") == selfId
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Surface(color = if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.medium, modifier = Modifier.widthIn(max = 300.dp)) {
                        SelectionContainer { Text(message.text("content"), Modifier.padding(14.dp)) }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(input, { if (it.length <= 4000) input = it }, Modifier.weight(1f), placeholder = { Text("发送消息") }, maxLines = 4)
            Button(onClick = { model.send(input) { input = "" } }, enabled = input.isNotBlank() && !model.busy) { Text("发送") }
        }
    }
}

@Composable fun AccountScreen(model: BlogModel) {
    var email by rememberSaveable(model.loginEmailHint) { mutableStateOf(model.loginEmailHint) }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var announcement by rememberSaveable { mutableStateOf("") }
    var confirmBroadcast by remember { mutableStateOf(false) }
    var broadcastResult by remember { mutableStateOf("") }
    val context = LocalContext.current
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        val user = model.session?.optJSONObject("user")
        if (model.restoringSession) {
            CircularProgressIndicator()
            Text("正在恢复登录状态…")
        } else if (model.pendingMfa) {
            Text("二次验证", style = MaterialTheme.typography.headlineMedium)
            Text("请输入验证器中的验证码或一枚恢复码。")
            OutlinedTextField(code, { code = it }, label = { Text("验证码 / 恢复码") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(onClick = { val submitted = code; code = ""; model.verifyMfa(submitted) }, enabled = code.isNotBlank() && !model.busy) { Text("验证并登录") }
            TextButton(onClick = { model.logout() }, enabled = !model.busy) { Text("取消登录") }
        } else if (user != null) {
            Text(user.text("name"), style = MaterialTheme.typography.headlineMedium)
            Text(user.text("email"))
            if (user.text("role") == "admin") {
                HorizontalDivider()
                Text("管理员群发", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(announcement, { if (it.length <= 4000) announcement = it }, label = { Text("站内通知内容") }, modifier = Modifier.fillMaxWidth(), maxLines = 8)
                Button(onClick = { confirmBroadcast = true }, enabled = announcement.isNotBlank() && !model.busy) { Text("群发站内通知") }
                if (broadcastResult.isNotBlank()) Text(broadcastResult)
                if (confirmBroadcast) AlertDialog(onDismissRequest = { confirmBroadcast = false }, title = { Text("发送给所有用户？") }, text = { Text(announcement) },
                    confirmButton = { TextButton(onClick = { confirmBroadcast = false; model.broadcast(announcement) { count -> announcement = ""; broadcastResult = "已发送给 $count 位用户" } }) { Text("确认发送") } },
                    dismissButton = { TextButton(onClick = { confirmBroadcast = false }) { Text("取消") } })
            }
            OutlinedButton(onClick = { model.logout() }, enabled = !model.busy) { Text("退出登录") }
        } else {
            Text("登录边界笔记", style = MaterialTheme.typography.headlineMedium)
            Text("使用博客已有的邮箱账号，登录后与好友聊天。")
            OutlinedTextField(email, { email = it }, label = { Text("邮箱") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(password, { password = it }, label = { Text("密码") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
            Button(onClick = { val submitted = password; password = ""; model.login(email, submitted) }, enabled = email.isNotBlank() && password.isNotEmpty() && !model.busy) { Text("登录") }
            TextButton(onClick = { model.registration.open() }, enabled = !model.busy) { Text("没有账号？注册") }
            TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.SITE_URL + "/forgot-password"))) }) { Text("忘记密码") }
        }
    }
}
