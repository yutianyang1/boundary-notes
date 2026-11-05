package site.xiudou.boundarynotes

import android.content.Intent
import android.net.Uri
import android.widget.TextView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.MarkwonConfiguration
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.image.ImagesPlugin
import io.noties.markwon.image.destination.ImageDestinationProcessor
import io.noties.markwon.image.network.NetworkSchemeHandler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

fun siteDate(value:String,pattern:String="yyyy.MM.dd"):String=runCatching {
    DateTimeFormatter.ofPattern(pattern).withZone(ZoneId.systemDefault()).format(Instant.parse(value))
}.getOrDefault(value.take(10))

@Composable fun PostsScreen(model:BlogModel) {
    var query by rememberSaveable{mutableStateOf("")}
    LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item { PageHeading("WRITING / 写作","文章","记录软件架构、工程实践与值得反复推敲的设计决定。") }
        item { Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically) {
            SiteField(query,{query=it},Modifier.weight(1f),placeholder={Text("搜索文章…")},singleLine=true,
                keyboardOptions=KeyboardOptions(imeAction=androidx.compose.ui.text.input.ImeAction.Search))
            SiteButton(onClick={model.loadPosts(query)},enabled=!model.busy){Text("搜索")}
        } }
        if(model.posts.isEmpty()&&!model.busy)item{EmptyCard("暂无文章","换个关键词，或重新搜索试试。")}
        items(model.posts,key={it.getString("id")}){post->PostCard(post){model.openPost(post)}}
        if(model.hasMore)item{SiteOutlinedButton(onClick={model.more()},enabled=!model.busy,modifier=Modifier.fillMaxWidth()){Text("加载更多文章")}}
        item{Text("边界笔记 · 在复杂系统中寻找清晰的边界",color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodySmall,modifier=Modifier.padding(vertical=12.dp))}
    }
}
@Composable fun PostCard(post:JSONObject,onClick:()->Unit) {
    Surface(onClick=onClick,shape=RoundedCornerShape(14.dp),color=MaterialTheme.colorScheme.surface,
        border=BorderStroke(1.dp,MaterialTheme.colorScheme.outline),shadowElevation=1.dp,modifier=Modifier.fillMaxWidth()) {
        Column {
            ArticleCover(post.text("slug"),post.text("categorySlug"),post.text("cover"))
            Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
            Text(post.text("title"),style=MaterialTheme.typography.titleLarge,maxLines=4,overflow=TextOverflow.Ellipsis)
            if(post.text("summary").isNotBlank())Text(post.text("summary"),color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodyMedium,maxLines=3,overflow=TextOverflow.Ellipsis)
            Text(buildList{if(post.text("categoryName").isNotBlank())add(post.text("categoryName"));add(siteDate(post.text("publishedAt")));if(post.has("charCount"))add("约 ${maxOf(1,kotlin.math.round(post.optInt("charCount")/400.0).toInt())} 分钟")}.joinToString(" · "),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable fun ArticleScreen(post:JSONObject) {
    val context=LocalContext.current;val colors=MaterialTheme.colorScheme
    val markwon=remember(colors){Markwon.builder(context).usePlugin(TablePlugin.create(context)).usePlugin(ImagesPlugin.create().addSchemeHandler(NetworkSchemeHandler.create()))
        .usePlugin(object:AbstractMarkwonPlugin(){
            override fun configureTheme(builder:MarkwonTheme.Builder){builder.linkColor(colors.primary.toArgb()).codeBackgroundColor(colors.surfaceVariant.toArgb()).codeTextColor(colors.onSurface.toArgb()).blockQuoteColor(colors.primary.toArgb()).headingBreakColor(colors.outline.toArgb()).thematicBreakColor(colors.outline.toArgb())}
            override fun configureConfiguration(builder:MarkwonConfiguration.Builder){builder.imageDestinationProcessor(object:ImageDestinationProcessor(){
                override fun process(destination:String):String {val resolved=BuildConfig.SITE_URL.toHttpUrl().resolve(destination);return if(resolved?.scheme=="https")resolved.toString() else ""}
            })}
        }).build()}
    LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
        item{SiteLabel(post.text("categoryName").ifBlank{"文章 / ARTICLE"})}
        item{Text(post.text("title"),style=MaterialTheme.typography.headlineMedium)}
        item{Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){SiteAvatar(post.text("authorName"),32,post.text("authorImage"));Column{Text(post.text("authorName"),style=MaterialTheme.typography.labelMedium);Text(siteDate(post.text("publishedAt"))+" · 约 ${maxOf(1,kotlin.math.round(post.optInt("charCount")/400.0).toInt())} 分钟",style=MaterialTheme.typography.bodySmall,color=colors.onSurfaceVariant)}}}
        item{Surface(shape=RoundedCornerShape(14.dp)){ArticleCover(post.text("slug"),post.text("categorySlug"),post.text("cover"))}}
        item{HorizontalDivider(color=colors.outline)}
        item{Surface(shape=RoundedCornerShape(14.dp),color=colors.surface,border=BorderStroke(1.dp,colors.outline)){
            AndroidView(factory={TextView(it).apply{textSize=17f;setLineSpacing(6f,1.15f);setTextIsSelectable(true)}},
                update={it.setTextColor(colors.onSurface.toArgb());it.setLinkTextColor(colors.primary.toArgb());markwon.setMarkdown(it,post.text("contentMd"))},modifier=Modifier.fillMaxWidth().padding(20.dp))
        }}
    }
}

@Composable fun SocialTabs(selected:Int,counts:List<Int>,onSelect:(Int)->Unit) {
    Surface(shape=RoundedCornerShape(10.dp),color=MaterialTheme.colorScheme.surfaceVariant) {
        Row(Modifier.fillMaxWidth().padding(4.dp),horizontalArrangement=Arrangement.spacedBy(4.dp)) {
            listOf("会话","好友","通知").forEachIndexed{index,title->
                Surface(onClick={onSelect(index)},modifier=Modifier.weight(1f),shape=RoundedCornerShape(8.dp),
                    color=if(selected==index)MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.surfaceVariant,
                    border=if(selected==index)BorderStroke(1.dp,MaterialTheme.colorScheme.outline)else null) {
                    Row(Modifier.heightIn(min=44.dp).padding(horizontal=6.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.Center) {
                        Text(title,color=if(selected==index)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.labelLarge)
                        if(counts[index]>0){Spacer(Modifier.width(6.dp));Badge{Text(if(counts[index]>99)"99+" else "${counts[index]}")}}
                    }
                }
            }
        }
    }
}
@Composable fun SocialScreen(model:BlogModel) {
    val data=model.social;var tab by rememberSaveable{mutableIntStateOf(0)};var query by rememberSaveable{mutableStateOf("")}
    val counts=data?.optJSONObject("unreadCounts")
    LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item{Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){PageHeading("CONNECT / 连接","好友与消息")};TextButton(onClick={model.task{model.refreshSocial()}},enabled=!model.busy){Text("刷新")}}}
        item{SocialTabs(tab,listOf(counts?.optInt("messages")?:0,counts?.optInt("requests")?:0,counts?.optInt("announcements")?:0)){tab=it}}
        if(data==null)item{EmptyCard("正在读取消息","你的会话和好友会显示在这里。")}
        if(tab==0){
            val conversations=data?.optJSONArray("conversations")?.rows().orEmpty()
            if(data!=null&&conversations.isEmpty())item{EmptyCard("还没有会话","添加好友后，就可以从这里开始聊天。")}
            items(conversations,key={"chat:"+it.getString("id")}){conversation->
                Surface(onClick={model.openChat(conversation,false)},shape=RoundedCornerShape(14.dp),color=MaterialTheme.colorScheme.surface,border=BorderStroke(1.dp,MaterialTheme.colorScheme.outline)){
                    Row(Modifier.fillMaxWidth().padding(16.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                        SiteAvatar(conversation.text("peerName"),40,conversation.text("peerImage"));Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)){
                            Text(conversation.text("peerName"),style=MaterialTheme.typography.titleMedium,maxLines=1,overflow=TextOverflow.Ellipsis)
                            Text(conversation.text("latestContent").ifEmpty{"开始聊天"},maxLines=1,overflow=TextOverflow.Ellipsis,color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodySmall)
                        }
                        Column(horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(8.dp)){
                            Text(siteDate(conversation.text("lastMessageAt"),"MM.dd"),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                            if(conversation.optInt("unreadCount")>0)Badge{Text("${conversation.optInt("unreadCount")}")}
                        }
                    }
                }
            }
        }else if(tab==1){
            item{SiteCard{
                Text("添加好友",style=MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){SiteField(query,{query=it},Modifier.weight(1f),placeholder={Text("ID、昵称或邮箱")},singleLine=true);SiteButton(onClick={model.searchUsers(query)},enabled=query.isNotBlank()&&!model.busy){Text("查找")}}
                if(model.foundUsers.isNotEmpty())HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
                model.foundUsers.forEach{user->Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){SiteAvatar(user.text("name"),32);Column(Modifier.weight(1f)){Text(user.text("name"),style=MaterialTheme.typography.titleMedium);Text(user.text("publicId"),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)};TextButton(onClick={model.friendship("request",user.getString("id"))},enabled=!model.busy){Text("添加")}}}
            }}
            val requests=data?.optJSONArray("requests")?.rows().orEmpty()
            if(requests.isNotEmpty())item{SiteCard{
                Text("好友申请",style=MaterialTheme.typography.titleMedium)
                requests.forEach{request->Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){SiteAvatar(request.text("peerName"),32);Column{Text(request.text("peerName"),style=MaterialTheme.typography.titleMedium);Text(if(request.text("direction")=="incoming")"希望添加你为好友" else "等待对方接受",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}}
                    if(request.text("direction")=="incoming")Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){SiteButton(onClick={model.friendship("accept",request.getString("id"))},enabled=!model.busy){Text("接受")};SiteOutlinedButton(onClick={model.friendship("reject",request.getString("id"))},enabled=!model.busy){Text("忽略")}}
                }}
            }}
            item{FriendGroupsPanel(model)}
        }else{
            val notices=data?.optJSONArray("announcements")?.rows().orEmpty()
            if(data!=null&&notices.isEmpty())item{EmptyCard("暂时没有通知","站内公告会显示在这里。")}
            items(notices,key={"notice:"+it.getString("id")}){notice->SiteCard{
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){SiteLabel(if(notice.isNull("readAt"))"新通知" else "站内公告");Text(siteDate(notice.text("createdAt")),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
                SelectionContainer{Text(notice.text("content"),style=MaterialTheme.typography.bodyMedium)}
                if(notice.isNull("readAt"))SiteOutlinedButton(onClick={model.readNotice(notice.getString("id"))},enabled=!model.busy){Text("查看并标记已读")}
            }}
        }
    }
}

@Composable fun ChatScreen(model:BlogModel) {
    val chatId=model.chat?.text("id")?:"";var input by rememberSaveable(chatId){mutableStateOf("")}
    val selfId=model.session?.optJSONObject("user")?.text("id")
    val listState=androidx.compose.foundation.lazy.rememberLazyListState();val lifecycle=LocalLifecycleOwner.current.lifecycle
    var followEnd by remember(chatId){mutableStateOf(true)}
    LaunchedEffect(model.messages.lastOrNull()?.text("id")){if(followEnd&&model.messages.isNotEmpty())listState.scrollToItem(model.messages.lastIndex)}
    LaunchedEffect(chatId,lifecycle){lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED){var acknowledged=""
        while(true){val last=model.messages.lastOrNull()?.text("id");val info=listState.layoutInfo
            val latestVisible=info.visibleItemsInfo.lastOrNull()?.let{it.key==last&&it.offset+it.size<=info.viewportEndOffset}==true
            followEnd=!listState.canScrollForward
            if(latestVisible&&last!=null&&last!=acknowledged){try{model.readVisibleMessage(chatId,last);acknowledged=last}catch(e:CancellationException){throw e}catch(e:Exception){model.error=e.message}}
            delay(500)
        }
    }}
    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(state=listState,modifier=Modifier.weight(1f).fillMaxWidth(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
            items(model.messages,key={it.getString("id")}){message->ChatBubble(message,message.text("senderId")==selfId,model.chat?.text("peerName")?:"",model.chat?.text("peerImage"))}
        }
        Surface(color=MaterialTheme.colorScheme.surface){Column{
            HorizontalDivider(color=MaterialTheme.colorScheme.outline)
            Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                SiteField(input,{if(it.length<=4000)input=it},Modifier.weight(1f),placeholder={Text("写一条消息…")},maxLines=4)
                SiteButton(onClick={model.send(input){input=""}},enabled=input.isNotBlank()&&!model.busy){Text("发送")}
            }
        }}
    }
}
@Composable fun ChatBubble(message:JSONObject,mine:Boolean,name:String,image:String?=null) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=if(mine)Arrangement.End else Arrangement.Start,verticalAlignment=Alignment.Top) {
        if(!mine){SiteAvatar(name,28,image);Spacer(Modifier.width(8.dp))}
        Column(Modifier.weight(1f,fill=false).widthIn(max=280.dp),horizontalAlignment=if(mine)Alignment.End else Alignment.Start,verticalArrangement=Arrangement.spacedBy(4.dp)){
            Surface(shape=RoundedCornerShape(topStart=if(mine)14.dp else 4.dp,topEnd=if(mine)4.dp else 14.dp,bottomStart=14.dp,bottomEnd=14.dp),
                color=if(mine)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                contentColor=if(mine)MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                border=if(mine)null else BorderStroke(1.dp,MaterialTheme.colorScheme.outline)){
                SelectionContainer{Text(message.text("content"),Modifier.padding(horizontal=16.dp,vertical=12.dp),style=MaterialTheme.typography.bodyMedium)}
            }
            Text(siteDate(message.text("createdAt"),"HH:mm"),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable fun AccountScreen(model:BlogModel) {
    var email by rememberSaveable(model.loginEmailHint){mutableStateOf(model.loginEmailHint)};var password by remember{mutableStateOf("")};var code by remember{mutableStateOf("")}
    val context=LocalContext.current;val user=model.session?.optJSONObject("user")
    val avatarPicker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)model.uploadAvatar(uri)}
    when {
        model.restoringSession->AuthFrame("账号中心","正在恢复登录状态…"){CircularProgressIndicator()}
        model.pendingMfa->AuthFrame("二次验证","请输入验证器中的验证码或一枚恢复码。"){
            SiteField(code,{code=it},label={Text("验证码 / 恢复码")},singleLine=true,modifier=Modifier.fillMaxWidth())
            SiteButton(onClick={val submitted=code;code="";model.verifyMfa(submitted)},enabled=code.isNotBlank()&&!model.busy,modifier=Modifier.fillMaxWidth()){Text("验证并登录")}
            TextButton(onClick={model.logout()},enabled=!model.busy){Text("取消登录")}
        }
        user!=null->AccountProfile(user,model.busy,onLogout={model.logout()},adminContent={AdminBroadcast(model)},onSaveName={model.saveProfile(it)},onPickAvatar={avatarPicker.launch("image/*")},notice=model.profileNotice)
        else->AuthFrame("欢迎回来","登录边界笔记，继续阅读与交流。"){
            SiteBrand();HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
            SiteField(email,{email=it},label={Text("邮箱")},singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Email),modifier=Modifier.fillMaxWidth())
            SiteField(password,{password=it},label={Text("密码")},singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),modifier=Modifier.fillMaxWidth())
            SiteButton(onClick={val submitted=password;password="";model.login(email,submitted)},enabled=email.isNotBlank()&&password.isNotEmpty()&&!model.busy,modifier=Modifier.fillMaxWidth()){Text("登录")}
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){TextButton(onClick={model.registration.open()},enabled=!model.busy){Text("注册账号")};TextButton(onClick={context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(BuildConfig.SITE_URL+"/forgot-password")))}){Text("忘记密码？")}}
        }
    }
}
@Composable fun AccountProfile(user:JSONObject,busy:Boolean,onLogout:()->Unit,adminContent:@Composable ()->Unit={},onSaveName:(String)->Unit={},onPickAvatar:()->Unit={},notice:String="") {
    var name by rememberSaveable(user.text("name")){mutableStateOf(user.text("name"))}
    LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
        item{PageHeading("ACCOUNT / 账号","个人中心")}
        item{SiteCard{
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)){
                SiteAvatar(user.text("name"),56,user.text("image"));Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(6.dp)){
                    Text(user.text("name"),style=MaterialTheme.typography.headlineSmall)
                    SiteLabel(when(user.text("role")){"admin"->"管理员";"editor"->"编辑";else->"读者"})
                }
            }
            HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
            Text("邮箱",style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
            SelectionContainer{Text(user.text("email"),style=MaterialTheme.typography.bodyMedium)}
        }}
        item{SiteCard{
            Text("个人资料",style=MaterialTheme.typography.titleLarge)
            Text("更新站内显示名称和头像。",color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodySmall)
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)){
                SiteAvatar(user.text("name"),56,user.text("image"));SiteOutlinedButton(onClick=onPickAvatar,enabled=!busy){Text("更新头像")}
            }
            Text("JPEG、PNG、WebP、AVIF 或 HEIC，最大 2 MB。",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
            SiteField(name,{if(it.length<=120)name=it},label={Text("昵称")},singleLine=true,modifier=Modifier.fillMaxWidth())
            SiteButton(onClick={onSaveName(name.trim())},enabled=name.isNotBlank()&&!busy,modifier=Modifier.fillMaxWidth()){Text(if(busy)"正在保存…" else "保存资料")}
            if(notice.isNotBlank())Text(notice,color=MaterialTheme.colorScheme.primary,style=MaterialTheme.typography.bodySmall)
        }}
        if(user.text("role")=="admin")item{adminContent()}
        item{SiteOutlinedButton(onClick=onLogout,enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("退出登录")}}
        item{Text("边界笔记 · ${BuildConfig.VERSION_NAME}",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
    }
}
@Composable fun AdminBroadcast(model:BlogModel) {
    var announcement by rememberSaveable{mutableStateOf("")};var confirm by remember{mutableStateOf(false)};var result by remember{mutableStateOf("")}
    SiteCard{
        SiteLabel("ADMIN / 管理员");Text("群发站内通知",style=MaterialTheme.typography.titleLarge)
        SiteField(announcement,{if(it.length<=4000)announcement=it},label={Text("通知内容")},placeholder={Text("写一条公告…")},maxLines=8,modifier=Modifier.fillMaxWidth())
        Text("${announcement.length}/4000",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        SiteButton(onClick={confirm=true},enabled=announcement.isNotBlank()&&!model.busy,modifier=Modifier.fillMaxWidth()){Text("群发给全部用户")}
        if(result.isNotBlank())Text(result,color=MaterialTheme.colorScheme.primary)
    }
    if(confirm)AlertDialog(onDismissRequest={confirm=false},title={Text("发送给所有用户？")},text={Text(announcement)},
        confirmButton={TextButton(onClick={confirm=false;model.broadcast(announcement){count->announcement="";result="已发送给 $count 位用户"}}){Text("确认发送")}},dismissButton={TextButton(onClick={confirm=false}){Text("取消")}})
}
