package site.xiudou.boundarynotes

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable fun FriendGroupsPanel(model: BlogModel) {
    val groups = model.social?.optJSONArray("groups")?.rows().orEmpty()
    val friends = model.social?.optJSONArray("friends")?.rows().orEmpty()
    var query by rememberSaveable { mutableStateOf("") }
    var newName by rememberSaveable { mutableStateOf("") }
    var edit by remember { mutableStateOf<JSONObject?>(null) }
    var editName by remember { mutableStateOf("") }
    var moving by remember { mutableStateOf<JSONObject?>(null) }
    var deleting by remember { mutableStateOf<JSONObject?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(query,{query=it},label={Text("搜索好友昵称")},singleLine=true,modifier=Modifier.fillMaxWidth())
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(newName,{if(it.length<=40)newName=it},label={Text("新分组名称")},singleLine=true,modifier=Modifier.weight(1f))
            TextButton(onClick={model.changeGroup(JSONObject().put("action","create").put("name",newName));newName=""},enabled=!model.busy&&newName.isNotBlank()){Text("新建")}
        }
        val sections = listOf(JSONObject().put("id","").put("name","未分组")) + groups
        for(group in sections) {
            val id = group.text("id")
            val matches = friends.filter { it.text("groupId")==id && it.text("peerName").contains(query.trim(),ignoreCase=true) }.sortedBy { it.text("peerName") }
            var expanded by rememberSaveable(id) { mutableStateOf(true) }
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                TextButton(onClick={expanded=!expanded}){Text("${if(expanded) "▾" else "▸"} ${group.text("name")} · ${matches.size}")}
                if(id.isNotEmpty()) Row {
                    TextButton(onClick={edit=group;editName=group.text("name")},enabled=!model.busy){Text("改名")}
                    TextButton(onClick={deleting=group},enabled=!model.busy){Text("删除")}
                }
            }
            if(expanded) for(friend in matches) ListItem(headlineContent={Text(friend.text("peerName"))},trailingContent={Row{
                TextButton(onClick={moving=friend},enabled=!model.busy){Text("分组")}
                TextButton(onClick={model.openChat(friend,true)},enabled=!model.busy){Text("聊天")}
            }})
        }
    }
    edit?.let { group -> AlertDialog(onDismissRequest={edit=null},title={Text("重命名分组")},text={OutlinedTextField(editName,{if(it.length<=40)editName=it},singleLine=true)},confirmButton={TextButton(onClick={model.changeGroup(JSONObject().put("action","rename").put("groupId",group.text("id")).put("name",editName));edit=null},enabled=editName.isNotBlank()&&!model.busy){Text("保存")}},dismissButton={TextButton(onClick={edit=null}){Text("取消")}}) }
    deleting?.let { group -> AlertDialog(onDismissRequest={deleting=null},title={Text("删除分组？")},text={Text("好友会回到未分组，好友关系保留。")},confirmButton={TextButton(onClick={model.changeGroup(JSONObject().put("action","delete").put("groupId",group.text("id")));deleting=null},enabled=!model.busy){Text("删除")}},dismissButton={TextButton(onClick={deleting=null}){Text("取消")}}) }
    moving?.let { friend -> AlertDialog(onDismissRequest={moving=null},title={Text("移动 ${friend.text("peerName")} 到分组")},text={Column {
        for(group in listOf(JSONObject().put("id","").put("name","未分组"))+groups) TextButton(onClick={model.changeGroup(JSONObject().put("action","assign").put("friendshipId",friend.text("id")).put("groupId",group.text("id").ifEmpty{null}?:JSONObject.NULL));moving=null},enabled=!model.busy){Text(group.text("name"))}
    }},confirmButton={},dismissButton={TextButton(onClick={moving=null}){Text("取消")}}) }
}
