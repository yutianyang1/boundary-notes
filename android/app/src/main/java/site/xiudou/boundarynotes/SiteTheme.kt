package site.xiudou.boundarynotes

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Mirrors app/globals.css: cool gray canvas, blue brand, 8dp controls, 14dp cards.
private val Light = lightColorScheme(
    primary=Color(0xFF2D60E7), onPrimary=Color.White, primaryContainer=Color(0xFFE3EBFD), onPrimaryContainer=Color(0xFF2449A7),
    background=Color(0xFFF9FAFB), onBackground=Color(0xFF091019),
    surface=Color.White, onSurface=Color(0xFF091019), surfaceVariant=Color(0xFFEDF0F4), onSurfaceVariant=Color(0xFF4F5967),
    surfaceContainer=Color.White, surfaceContainerLow=Color.White, surfaceContainerHigh=Color(0xFFEDF0F4),
    outline=Color(0xFFD9DFE6), outlineVariant=Color(0xFFE4E9F1),
    error=Color(0xFFC43535), errorContainer=Color(0xFFFFEEEE), onErrorContainer=Color(0xFF8F2525),
)
private val Dark = darkColorScheme(
    primary=Color(0xFF6DA0FF), onPrimary=Color(0xFF0A101B), primaryContainer=Color(0xFF1C2C50), onPrimaryContainer=Color(0xFFCAD9FF),
    background=Color(0xFF080C13), onBackground=Color(0xFFEBEFF4),
    surface=Color(0xFF11161F), onSurface=Color(0xFFEBEFF4), surfaceVariant=Color(0xFF1C222B), onSurfaceVariant=Color(0xFF99A2AF),
    surfaceContainer=Color(0xFF11161F), surfaceContainerLow=Color(0xFF11161F), surfaceContainerHigh=Color(0xFF1C222B),
    outline=Color(0xFF272E38), outlineVariant=Color(0xFF263141),
)
private val Type = Typography(
    headlineLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.Bold,fontSize=32.sp,lineHeight=40.sp),
    headlineMedium=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.Bold,fontSize=28.sp,lineHeight=36.sp),
    headlineSmall=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.Bold,fontSize=24.sp,lineHeight=32.sp),
    titleLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.Bold,fontSize=20.sp,lineHeight=28.sp),
    titleMedium=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.SemiBold,fontSize=16.sp,lineHeight=24.sp),
    bodyLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontSize=16.sp,lineHeight=26.sp),
    bodyMedium=TextStyle(fontFamily=FontFamily.SansSerif,fontSize=14.sp,lineHeight=22.sp),
    bodySmall=TextStyle(fontFamily=FontFamily.SansSerif,fontSize=12.sp,lineHeight=18.sp),
    labelLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.SemiBold,fontSize=14.sp,lineHeight=20.sp),
    labelMedium=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.Medium,fontSize=12.sp,lineHeight=18.sp),
    labelSmall=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.Medium,fontSize=11.sp,lineHeight=16.sp),
)
@Composable fun SiteTheme(dark: Boolean = isSystemInDarkTheme(),content: @Composable ()->Unit) {
    MaterialTheme(colorScheme=if(dark) Dark else Light,typography=Type,
        shapes=Shapes(extraSmall=RoundedCornerShape(6.dp),small=RoundedCornerShape(8.dp),medium=RoundedCornerShape(14.dp),large=RoundedCornerShape(14.dp),extraLarge=RoundedCornerShape(20.dp)),content=content)
}
@Composable fun SiteCard(modifier: Modifier=Modifier,content: @Composable ColumnScope.()->Unit) {
    Surface(modifier=modifier.fillMaxWidth(),shape=RoundedCornerShape(14.dp),color=MaterialTheme.colorScheme.surface,
        border=BorderStroke(1.dp,MaterialTheme.colorScheme.outline),shadowElevation=1.dp) {
        Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp),content=content)
    }
}
@Composable fun SiteButton(onClick:()->Unit,modifier:Modifier=Modifier,enabled:Boolean=true,content:@Composable RowScope.()->Unit) {
    Button(onClick,modifier.heightIn(min=44.dp),enabled=enabled,shape=RoundedCornerShape(8.dp),contentPadding=PaddingValues(horizontal=16.dp,vertical=12.dp),content=content)
}
@Composable fun SiteOutlinedButton(onClick:()->Unit,modifier:Modifier=Modifier,enabled:Boolean=true,content:@Composable RowScope.()->Unit) {
    OutlinedButton(onClick,modifier.heightIn(min=44.dp),enabled=enabled,shape=RoundedCornerShape(8.dp),border=BorderStroke(1.dp,MaterialTheme.colorScheme.outline),content=content)
}
@Composable fun SiteField(value:String,onValueChange:(String)->Unit,modifier:Modifier=Modifier,label:(@Composable ()->Unit)?=null,
    placeholder:(@Composable ()->Unit)?=null,singleLine:Boolean=false,maxLines:Int=if(singleLine)1 else Int.MAX_VALUE,
    enabled:Boolean=true,keyboardOptions:KeyboardOptions=KeyboardOptions.Default,visualTransformation:VisualTransformation=VisualTransformation.None,
    trailingIcon:(@Composable ()->Unit)?=null) {
    Column(modifier,verticalArrangement=Arrangement.spacedBy(8.dp)) {
        if(label!=null) ProvideTextStyle(MaterialTheme.typography.labelLarge){label()}
        OutlinedTextField(value,onValueChange,Modifier.fillMaxWidth(),placeholder=placeholder,singleLine=singleLine,maxLines=maxLines,
            enabled=enabled,keyboardOptions=keyboardOptions,visualTransformation=visualTransformation,trailingIcon=trailingIcon,
            shape=RoundedCornerShape(8.dp),textStyle=MaterialTheme.typography.bodyMedium,
            colors=OutlinedTextFieldDefaults.colors(unfocusedBorderColor=MaterialTheme.colorScheme.outline,
                unfocusedContainerColor=MaterialTheme.colorScheme.background,focusedContainerColor=MaterialTheme.colorScheme.background))
    }
}
@Composable fun SiteBrand(compact:Boolean=false) {
    val primary=MaterialTheme.colorScheme.primary;val onPrimary=MaterialTheme.colorScheme.onPrimary
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        Canvas(Modifier.size(if(compact)24.dp else 32.dp)){
            val unit=size.width/32f
            drawRoundRect(primary,cornerRadius=CornerRadius(7.5f*unit))
            val path=Path().apply{moveTo(6.5f*unit,25.5f*unit);lineTo(6.5f*unit,18.5f*unit);lineTo(14f*unit,18.5f*unit);lineTo(14f*unit,11f*unit);lineTo(21.5f*unit,11f*unit);lineTo(21.5f*unit,6.5f*unit)}
            drawPath(path,onPrimary,style=Stroke(3.4f*unit,cap=StrokeCap.Round,join=StrokeJoin.Round))
        }
        Text("边界笔记",style=if(compact)MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge)
    }
}
@Composable fun SiteAvatar(name:String,size:Int=40,image:String?=null) {
    val bitmap=siteBitmap(image)
    Box(Modifier.size(size.dp).clip(RoundedCornerShape(50)).background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary,Color(0xFFDC8A52)))),contentAlignment=Alignment.Center) {
        if(bitmap!=null)Image(bitmap.asImageBitmap(),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
        else Text(name.trim().take(1).ifEmpty{"边"}.uppercase(),color=Color.White,fontWeight=FontWeight.Bold,fontSize=(size*.37f).sp)
    }
}
@Composable fun SiteLabel(text:String) {
    Text(text,color=MaterialTheme.colorScheme.primary,style=MaterialTheme.typography.labelSmall,
        modifier=Modifier.clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.primaryContainer).padding(horizontal=8.dp,vertical=4.dp))
}
@Composable fun PageHeading(eyebrow:String,title:String,description:String="") {
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text(eyebrow,style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary,letterSpacing=2.sp)
        Text(title,style=MaterialTheme.typography.headlineMedium)
        if(description.isNotBlank())Text(description,color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodyMedium)
    }
}
@Composable fun EmptyCard(title:String,description:String) { SiteCard {Text(title,style=MaterialTheme.typography.titleMedium);Text(description,color=MaterialTheme.colorScheme.onSurfaceVariant)} }
@Composable fun AuthFrame(title:String,description:String,content:@Composable ColumnScope.()->Unit) {
    Box(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()),contentAlignment=Alignment.TopCenter) {
        Column(Modifier.widthIn(max=520.dp).fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(24.dp)) {
            Spacer(Modifier.height(8.dp));PageHeading("ACCOUNT / 账号",title,description);SiteCard(content=content)
        }
    }
}

@Composable fun SiteBottomNavigation(selected:Int,unread:Int,onSelect:(Int)->Unit) {
    Surface(color=MaterialTheme.colorScheme.surface){Column{
        HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal=12.dp,vertical=8.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
            listOf("文章","消息","我的").forEachIndexed{index,title->
                val color=if(selected==index)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                Column(Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(if(selected==index)MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
                    .selectable(selected==index,role=Role.Tab,onClick={onSelect(index)}).padding(vertical=10.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(4.dp)){
                    BadgedBox(badge={if(index==1&&unread>0)Badge{Text(if(unread>99)"99+" else "$unread")}}){Icon(painterResource(listOf(R.drawable.ic_read,R.drawable.ic_chat,R.drawable.ic_person)[index]),null,tint=color,modifier=Modifier.size(20.dp))}
                    Text(title,color=color,style=MaterialTheme.typography.labelMedium)
                }
            }
        }
    }}
}
