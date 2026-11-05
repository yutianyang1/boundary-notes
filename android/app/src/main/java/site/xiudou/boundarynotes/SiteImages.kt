package site.xiudou.boundarynotes

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.util.concurrent.TimeUnit
import kotlin.math.*

private val imageCache=object:LruCache<String,Bitmap>(12*1024*1024){override fun sizeOf(key:String,value:Bitmap)=value.byteCount}
private val imagesClient=OkHttpClient.Builder().callTimeout(15,TimeUnit.SECONDS).build()
@Composable fun siteBitmap(source:String?):Bitmap? {
    val image by produceState<Bitmap?>(imageCache.get(source.orEmpty()),source){
        if(source.isNullOrBlank())return@produceState
        value=withContext(Dispatchers.IO){
            try{
                val url=BuildConfig.SITE_URL.toHttpUrl().resolve(source)?.takeIf{it.scheme=="https"}?:return@withContext null
                imageCache.get(url.toString())?.let{return@withContext it}
                imagesClient.newCall(Request.Builder().url(url).build()).execute().use{response->
                    if(!response.isSuccessful)return@use null
                    val body=response.body?:return@use null
                    if(body.contentLength()>5*1024*1024)return@use null
                    val bytes=body.byteStream().use{input->val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);var n=input.read(buffer)
                        while(n>=0){output.write(buffer,0,n);if(output.size()>5*1024*1024)break;n=input.read(buffer)};output.toByteArray()}
                    if(bytes.size>5*1024*1024)return@use null
                    val options=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)
                    if(options.outWidth<=0||options.outHeight<=0)return@use null
                    options.inSampleSize=max(1,max(options.outWidth,options.outHeight)/1200);options.inJustDecodeBounds=false
                    BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)?.also{imageCache.put(url.toString(),it)}
                }
            }catch(e:CancellationException){throw e}catch(_:Exception){null}
        }
    }
    return image
}

// Same FNV-1a + avalanche and motif/hue/focus salts as generated-cover.tsx.
private fun oklch(l:Double,c:Double,h:Double):Color {
    val a=c*cos(h*PI/180);val b=c*sin(h*PI/180)
    val ll=(l+.3963377774*a+.2158037573*b).pow(3);val mm=(l-.1055613458*a-.0638541728*b).pow(3);val ss=(l-.0894841775*a-1.291485548*b).pow(3)
    fun channel(x:Double)=((if(x<=.0031308)12.92*x else 1.055*x.pow(1/2.4)-.055).coerceIn(0.0,1.0)).toFloat()
    return Color(channel(4.0767416621*ll-3.3077115913*mm+.2309699292*ss),channel(-1.2684380046*ll+2.6097574011*mm-.3413193965*ss),channel(-.0041960863*ll-.7034186147*mm+1.707614701*ss))
}
@Composable fun ArticleCover(seed:String,group:String="",source:String?=null,modifier:Modifier=Modifier) {
    val image=siteBitmap(source);val dark=MaterialTheme.colorScheme.background.luminance()<.5f
    val hue=listOf(264,305,350,30,70,150,190,230)[(coverHash("hue:$seed")%8u).toInt()].toDouble()
    val motif=(coverHash("motif:${group.ifBlank{seed}}")%6u).toInt();val focus=listOf(.36f,.54f,.72f,.88f)[(coverHash("focus:$seed")%4u).toInt()]
    val plate=oklch(if(dark).21 else .27,.04,hue);val line=oklch(.78,.1,hue).copy(alpha=.24f);val glow=oklch(.62,.2,hue).copy(alpha=.25f)
    Box(modifier.fillMaxWidth().aspectRatio(2f)) {
        Canvas(Modifier.fillMaxSize()){
            drawRect(plate)
            val w=size.width;val h=size.height;val spacing=22.dp.toPx()
            drawRect(Brush.radialGradient(listOf(glow,Color.Transparent),center=Offset(w*focus,h*.15f),radius=w*.65f))
            when(motif){
                0->{var x=0f;while(x<w){drawLine(line,Offset(x,0f),Offset(x,h));x+=34.dp.toPx()};var y=0f;while(y<h){drawLine(line,Offset(0f,y),Offset(w,y));y+=34.dp.toPx()};drawCircle(glow,radius=w*.3f,center=Offset(w*.86f,h*.12f),style=Stroke(26.dp.toPx()))}
                1->{for(i in 1..18)drawCircle(line,radius=i*30.dp.toPx(),center=Offset(w*.12f,h*1.18f),style=Stroke(1.5.dp.toPx()))}
                2->{var x=0f;while(x<w){val strength=(.15+.7*abs(sin(x/w*8))).toFloat();drawLine(line,Offset(x,h*(1-strength)),Offset(x,h),strokeWidth=3.dp.toPx());x+=19.dp.toPx()}}
                3->{for(i in -6..12){val x=i*68.dp.toPx();drawLine(line,Offset(x,h*1.2f),Offset(x+w*.5f,-h*.2f),strokeWidth=14.dp.toPx())}}
                4->{var x=0f;while(x<w){var y=0f;while(y<h){drawCircle(line,radius=1.6.dp.toPx(),center=Offset(x,y));y+=spacing};x+=spacing}}
                else->{for(i in 1..18){val radius=i*26.dp.toPx();drawOval(line,topLeft=Offset(w*(focus+.04f)-radius*2,h*.08f-radius),size=Size(radius*4,radius*2),style=Stroke(1.5.dp.toPx()))}}
            }
            drawRect(Brush.verticalGradient(listOf(Color.White.copy(alpha=.04f),Color.Transparent,Color.Black.copy(alpha=.15f))))
        }
        if(image!=null)Image(image.asImageBitmap(),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
    }
}
