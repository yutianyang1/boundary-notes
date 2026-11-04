package site.xiudou.boundarynotes

import android.content.Intent
import android.os.SystemClock
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun RegistrationScreen(model: BlogModel, onLogin: () -> Unit) {
    val state = model.registration
    val context = LocalContext.current
    var email by rememberSaveable { mutableStateOf(state.email) }
    var link by remember { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var remaining by remember(state.cooldownUntil) { mutableIntStateOf(0) }
    LaunchedEffect(state.cooldownUntil) {
        do {
            remaining = ((state.cooldownUntil - SystemClock.elapsedRealtime() + 999) / 1000).coerceAtLeast(0).toInt()
            if (remaining > 0) delay(1000)
        } while (remaining > 0)
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        when {
            state.loading -> { CircularProgressIndicator(); Text("正在加载注册服务…") }
            state.enabled == null -> { Text("暂时无法连接注册服务"); Button(onClick = { state.refreshConfig() }) { Text("重试") } }
            state.enabled == false -> { Text("当前暂不开放注册", style = MaterialTheme.typography.titleLarge); Text("已有账号可以直接登录。"); TextButton(onClick = onLogin) { Text("返回登录") } }
            state.stage == 0 -> {
                Text("创建你的账号", style = MaterialTheme.typography.headlineMedium)
                Text("先验证邮箱，再设置昵称和密码。")
                OutlinedTextField(email, { email = it }, label = { Text("邮箱") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                Button(onClick = { state.requestEmail(email) }, enabled = email.isNotBlank() && !state.busy && remaining == 0) {
                    Text(if (state.busy) "正在发送…" else if (remaining > 0) "${remaining} 秒后重试" else "发送验证邮件")
                }
                TextButton(onClick = onLogin, enabled = !state.busy) { Text("已有账号？去登录") }
            }
            state.stage == 1 -> {
                Text("检查你的邮箱", style = MaterialTheme.typography.headlineMedium)
                if (state.emailHint.isNotBlank()) Text(state.emailHint)
                Text("打开邮件中的验证链接，或将链接复制到下方，在 App 中继续注册。")
                if (state.tokenReady) Text("已收到验证链接，点击下方按钮继续。", color = MaterialTheme.colorScheme.primary)
                else OutlinedTextField(link, { link = it }, label = { Text("粘贴邮箱验证链接") }, maxLines = 4, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                Button(onClick = { state.verifyLink(if (state.tokenReady) "" else link) }, enabled = !state.busy && (state.tokenReady || link.isNotBlank())) { Text("验证邮箱并继续") }
                if (state.notice.isNotBlank()) Text(state.notice)
                TextButton(onClick = {
                    runCatching { context.startActivity(Intent.createChooser(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_EMAIL), "打开邮箱")) }
                        .onFailure { model.error = "未找到邮箱应用，请手动打开邮箱查看邮件" }
                }) { Text("打开邮箱") }
                TextButton(onClick = { state.requestEmail(resend = true) }, enabled = state.email.isNotBlank() && remaining == 0 && !state.busy) {
                    Text(if (remaining > 0) "${remaining} 秒后可重发" else "重新发送验证邮件")
                }
                TextButton(onClick = { state.open() }, enabled = !state.busy) { Text("换一个邮箱") }
                TextButton(onClick = onLogin, enabled = !state.busy) { Text("已在网页完成注册？去登录") }
            }
            state.stage == 2 -> {
                Text("设置账号", style = MaterialTheme.typography.headlineMedium)
                Text("邮箱已验证：${state.email}")
                OutlinedTextField(name, { if (it.length <= 120) name = it }, label = { Text("昵称") }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(password, { if (it.length <= 1024) password = it }, label = { Text("密码（至少 8 个字符）") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(confirm, { if (it.length <= 1024) confirm = it }, label = { Text("确认密码") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                Button(onClick = { state.complete(name, password, confirm) { password = ""; confirm = "" } }, enabled = name.isNotBlank() && password.isNotEmpty() && confirm.isNotEmpty() && !state.busy) { Text(if (state.busy) "正在创建…" else "完成注册") }
            }
            else -> {
                Text(if (state.existingAccount) "邮箱验证完成" else "注册成功", style = MaterialTheme.typography.headlineMedium)
                Text("现在可以使用邮箱和密码登录边界笔记了。")
                Button(onClick = onLogin, enabled = !state.busy) { Text("去登录") }
            }
        }
    }
}
