// Real React widget, local fake APIs; no production messages or relationships.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SocialChatWidget}from'./components/social/social-chat-widget';createRoot(document.getElementById('root')).render(<SocialChatWidget userId="me" userName="我" userImage={null} isAdmin={false} cards={{}}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const cssRoot=process.env.CSS_ROOT??'/home/yty/blog/builds/native-register-20261104/.next/static';
function styles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?styles(`${dir}/${e.name}`):e.name.endsWith('.css')?[fs.readFileSync(`${dir}/${e.name}`,'utf8')]:[]).join('\n');}
const css=styles(cssRoot);
let unread=1,noticeUnread=true,failMessages=false,reads=[],groups=[],assigned=null;
const messages=[{id:'msg1',senderId:'peer',content:'一条私信',createdAt:new Date().toISOString()}];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://local');let body='';for await(const chunk of req)body+=chunk;
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text);return;}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(url.pathname==='/api/social'){res.end(JSON.stringify({groups,friends:[{id:'friend1',peerId:'peer',peerName:'小明',peerImage:null,groupId:assigned}],requests:[{id:'request',peerId:'p2',peerName:'申请人',direction:'incoming'}],conversations:[{id:'chat1',peerId:'peer',peerName:'小明',peerImage:null,latestContent:'一条私信',unreadCount:unread}],announcements:[{id:'notice1',content:'站内公告内容',createdAt:new Date().toISOString(),readAt:noticeUnread?null:new Date().toISOString()}],unread:unread+Number(noticeUnread)+1}));return;}
 if(url.pathname.endsWith('/messages')){if(failMessages){res.statusCode=500;res.end('{}');}else res.end(JSON.stringify({messages}));return;}
 if(url.pathname.endsWith('/read')){reads.push({path:url.pathname,body:body?JSON.parse(body):null});if(url.pathname.includes('/conversations/'))unread=0;else noticeUnread=false;res.statusCode=204;res.end();return;}
 if(url.pathname==='/api/social/groups'){const b=JSON.parse(body);if(b.action==='create')groups.push({id:'g1',name:b.name});if(b.action==='assign')assigned=b.groupId;res.end('{}');return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch();
 for(const width of [390,1440]){
  unread=1;noticeUnread=true;reads=[];groups=[];assigned=null;failMessages=false;messages.splice(1);
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('3 条未读',{exact:true}).waitFor();
  await page.getByRole('button',{name:'打开好友与消息',exact:true}).click();
  assert.equal(await page.getByLabel('3 条未读',{exact:true}).count(),1);assert.equal(reads.length,0);
  await page.getByRole('button',{name:/^公告/}).click();await page.waitForTimeout(200);assert.equal(reads.length,0);
  await page.getByRole('button',{name:'查看并标记已读'}).click();await page.getByLabel('2 条未读',{exact:true}).waitFor();assert.equal(reads.length,1);
  await page.getByRole('button',{name:/^好友/}).click();await page.getByLabel('新分组名称').fill('同事');await page.getByRole('button',{name:'新建分组'}).click();
  await page.getByLabel('移动 小明 到分组').selectOption({label:'同事'});await page.waitForTimeout(200);
  await page.getByLabel('筛选好友分组').selectOption({label:'同事'});await page.getByLabel('查找已有好友').fill('不存在');await page.getByText('暂无匹配好友',{exact:true}).waitFor();await page.getByLabel('查找已有好友').fill('小明');await page.getByRole('button',{name:'聊天',exact:true}).waitFor();
  await page.getByRole('button',{name:/^会话/}).click();failMessages=true;
  await page.getByRole('button',{name:/小明.*一条私信/}).click();await page.waitForTimeout(400);assert.equal(reads.length,1,'failed fetch must not acknowledge');
  await page.getByRole('button',{name:'关闭聊天',exact:true}).click();failMessages=false;
  await page.getByRole('button',{name:'打开好友与消息',exact:true}).click();await page.getByRole('button',{name:/小明.*一条私信/}).click();
  await page.getByLabel('1 条未读',{exact:true}).waitFor();assert.equal(reads.at(-1).body.messageId,'msg1');
  await page.getByRole('button',{name:'关闭聊天',exact:true}).click();const before=reads.length;unread=1;messages.push({id:`msg${width}`,senderId:'peer',content:'关闭后的新消息',createdAt:new Date().toISOString()});
  await page.waitForTimeout(3500);assert.equal(reads.length,before,'closed widget does not mark incoming messages read');
  await page.getByRole('button',{name:'打开好友与消息',exact:true}).click();await page.getByLabel('2 条未读',{exact:true}).waitFor();assert.equal(reads.length,before,'opening widget retains unread conversation');
  assert.deepEqual(errors,[]);await page.screenshot({path:`/tmp/social-unread-groups-${width}.png`});await page.close();
 }
 console.log('PASS desktop/mobile widget: persistent badges, category-specific read, failed fetch, hidden conversation, group create/move/search');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
