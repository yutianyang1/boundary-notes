// Isolated database and Redis; no real mail worker is started and no user data is copied.
// set -a; . /home/yty/blog/.env; set +a
// node --import tsx scripts/tests/mobile-registration.mjs /path/to/candidate-release
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { decryptOutboxPayload } from '../../lib/mail/outbox.ts';
import { createActionToken } from '../../lib/auth/action-tokens.ts';
import { verifyPassword } from '../../lib/auth/password.ts';

const require = createRequire(import.meta.url);
const { Client, Pool } = require('pg');
const { JSDOM } = require('jsdom');
const release = process.argv[2];
assert(release && fs.existsSync(`${release}/server.js`), 'Pass a built standalone release');
assert(process.env.DATABASE_URL, 'DATABASE_URL is required');
const runtime = '/home/yty/blog/runtime/bin';
const dbName = `blog_mobile_reg_test_${Date.now()}`;
assert(/^blog_mobile_reg_test_\d+$/.test(dbName));
const sourceUrl = new URL(process.env.DATABASE_URL);
const testUrl = new URL(sourceUrl);
testUrl.pathname = '/' + dbName;
const pgEnv = {
  ...process.env, PGHOST: sourceUrl.hostname, PGPORT: sourceUrl.port || '5432',
  PGUSER: decodeURIComponent(sourceUrl.username), PGPASSWORD: decodeURIComponent(sourceUrl.password),
  PGDATABASE: decodeURIComponent(sourceUrl.pathname.slice(1)),
};
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const admin = new Client({ connectionString: sourceUrl.toString() });
let pool, web, redis, created = false;
let serverLog = '';
const cookies = new Map();
let port;
function request(path, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : options.rawType ? body : options.form ? new URLSearchParams(body).toString() : JSON.stringify(body);
    const headers = { Host: 'xiudou.site', Origin: options.origin ?? 'https://xiudou.site', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '198.51.100.20' };
    if (options.session) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (payload !== null) {
      headers['Content-Type'] = options.rawType ?? (options.form ? 'application/x-www-form-urlencoded' : 'application/json');
      headers['Content-Length'] = Buffer.byteLength(payload);
      headers['X-Auth-Return-Redirect'] = '1';
    }
    const req = http.request({ hostname: '127.0.0.1', port, path, method: payload === null ? 'GET' : 'POST', headers }, response => {
      let text = '';
      if (options.session) for (const value of response.headers['set-cookie'] ?? []) {
        const item = value.split(';')[0]; const separator = item.indexOf('=');
        cookies.set(item.slice(0, separator), item.slice(separator + 1));
      }
      response.on('data', value => { text += value; });
      response.on('end', () => resolve({ status: response.statusCode, text, json: () => JSON.parse(text) }));
      response.on('error', reject);
    });
    req.setTimeout(8000, () => req.destroy(new Error('Test HTTP timeout')));
    req.on('error', reject); req.end(payload);
  });
}
const api = (body, options) => request('/api/mobile/registration', body, options);
async function submitWebsiteForm(path, field, values) {
  const response = await request(path, undefined, { session: true });
  assert.equal(response.status, 200);
  const dom = new JSDOM(response.text);
  const form = [...dom.window.document.forms].find(item => item.querySelector(`input[name="${field}"]`));
  assert(form, `website form for ${field}`);
  const data = new FormData();
  for (const input of form.querySelectorAll('input[name]')) data.append(input.name, input.value);
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  const encoded = new Request('https://fixture.invalid', { method: 'POST', body: data });
  const bytes = Buffer.from(await encoded.arrayBuffer());
  dom.window.close();
  return request(path, bytes, { session: true, rawType: encoded.headers.get('content-type') });
}
async function waitReady() {
  for (let i = 0; i < 40; i++) {
    if (web.exitCode !== null) throw new Error('Test server exited: ' + serverLog.slice(-1500));
    try { if ((await request('/api/mobile/registration')).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Test server not ready');
}
async function startWeb(enabled) {
  web = spawn(process.execPath, [`${release}/server.js`], { cwd: release, env: {
    ...process.env, DATABASE_URL: testUrl.toString(), REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    AUTH_SECRET: randomBytes(32).toString('base64url'), PUBLIC_REGISTRATION_ENABLED: String(enabled),
    PORT: String(port), HOSTNAME: 'localhost', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  web.stdout.on('data', chunk => { serverLog = (serverLog + chunk).slice(-12000); });
  web.stderr.on('data', chunk => { serverLog = (serverLog + chunk).slice(-12000); });
  await waitReady();
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); }); child.kill('SIGTERM');
  });
}
const countUsers = async () => Number((await pool.query('SELECT count(*) FROM users')).rows[0].count);
const redisPort = await freePort();
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`); created = true;
  const schema = execFileSync(`${runtime}/pg_dump`, ['--schema-only', '--no-owner', '--no-acl', '--no-comments'], { env: pgEnv, maxBuffer: 20 * 1024 * 1024 });
  execFileSync(`${runtime}/psql`, ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: schema, env: { ...pgEnv, PGDATABASE: dbName }, maxBuffer: 1024 * 1024 });
  pool = new Pool({ connectionString: testUrl.toString(), max: 2 });
  pool.on('error',error=>console.error('Test pool:',error.message));
  if(!(await pool.query("SELECT to_regclass('public.friend_groups') AS name")).rows[0].name)
    await pool.query(fs.readFileSync(new URL('../../drizzle/0018_friend_groups.sql',import.meta.url),'utf8'));
  process.env.MAIL_OUTBOX_KEY = randomBytes(32).toString('base64');
  redis = spawn(`${runtime}/redis-server`, ['--bind', '127.0.0.1', '--port', String(redisPort), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  port = await freePort(); await startWeb(true);
  assert.equal((await request('/api/mobile/registration')).json().enabled, true);
  const email = `native-${Date.now()}@example.invalid`;
  assert.equal((await api({ action: 'request', email }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await api({ action: 'request', email: 'invalid' })).status, 400);
  assert.equal((await api({ action: 'complete', token: 'a'.repeat(43), name: 'Test', password: 'password', confirmPassword: 'password', role: 'admin' })).status, 400);
  const sent = await api({ action: 'request', email }); assert.equal(sent.status, 200);
  assert.equal(sent.json().stage, 'email_sent'); assert.equal(await countUsers(), 0);
  const { rows: mails } = await pool.query('SELECT payload_enc FROM mail_outbox WHERE recipient=$1', [email]);
  assert.equal(mails.length, 1);
  const payload = decryptOutboxPayload(mails[0].payload_enc);
  const token = new URL(payload.verifyUrl).searchParams.get('token'); assert(token);
  const resend = await api({ action: 'request', email, resend: true });
  assert.equal(resend.status, 200); assert(resend.json().notice); assert(resend.json().cooldownSeconds > 0);
  assert.equal((await pool.query('SELECT count(*) FROM mail_outbox')).rows[0].count, '1');
  const password = randomBytes(24).toString('base64url') + '!a7';
  const complete = { action: 'complete', token, name: 'Native Test', password, confirmPassword: password };
  assert.equal((await api(complete)).status, 400, 'cannot register before email verification');
  assert.equal((await api({ action: 'verify', token: 'x'.repeat(43) })).status, 400);
  assert.equal((await api({ action: 'verify', token })).json().stage, 'verified');
  assert.equal((await api({ ...complete, confirmPassword: 'different' })).status, 400);
  assert.equal((await api({ ...complete, password: 'password123', confirmPassword: 'password123' })).status, 400);
  assert.equal(await countUsers(), 0);
  assert.equal((await api(complete)).json().stage, 'registered');
  const [user] = (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows;
  assert(user && user.role === 'reader' && user.email_verified && user.password_hash.startsWith('$argon2id$'));
  assert.equal((await api(complete)).status, 400, 'one-use token cannot be replayed');
  assert.equal((await api({ action: 'verify', token })).status, 400);
  assert.equal((await api({ action: 'request', email })).status, 409);
  const expired = createActionToken();
  await pool.query("INSERT INTO pending_registrations(email,token_digest,expires_at,verified_at) VALUES($1,$2,now()-interval '1 hour',now())", ['expired@example.invalid', expired.tokenDigest]);
  assert.equal((await api({ action: 'verify', token: expired.token })).status, 400);
  assert.equal((await api({ ...complete, token: expired.token })).status, 400);
  const concurrent = createActionToken();
  await pool.query("INSERT INTO pending_registrations(email,token_digest,expires_at,verified_at) VALUES($1,$2,now()+interval '1 hour',now())", ['parallel@example.invalid', concurrent.tokenDigest]);
  const results = await Promise.all([api({ ...complete, token: concurrent.token }), api({ ...complete, token: concurrent.token })]);
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert(results.every(result => [200, 400, 409].includes(result.status)));
  assert.equal(await countUsers(), 2);
  const csrf = (await request('/api/auth/csrf', undefined, { session: true })).json().csrfToken;
  const login = await request('/api/auth/callback/credentials', { csrfToken: csrf, email, password, callbackUrl: 'https://xiudou.site' }, { session: true, form: true });
  assert.equal(login.status, 200);
  const session = (await request('/api/auth/session', undefined, { session: true })).json();
  assert(session.user?.email === email && session.authState === 'full' && session.user.role === 'reader', 'registered account can sign in');
  const peer = (await pool.query("SELECT id FROM users WHERE email='parallel@example.invalid'")).rows[0];
  const [a,b]=[user.id,peer.id].sort();
  const friendship=(await pool.query("INSERT INTO friendships(user_a_id,user_b_id,requested_by,status) VALUES($1,$2,$1,'accepted') RETURNING id",[a,b])).rows[0];
  const foreignGroup=(await pool.query("INSERT INTO friend_groups(user_id,name) VALUES($1,'对方的分组') RETURNING id",[peer.id])).rows[0];
  const groupApi=body=>request('/api/social/groups',body,{session:true});
  assert.equal((await groupApi({action:'rename',groupId:foreignGroup.id,name:'不允许'})).status,400);
  const createdGroup=await groupApi({action:'create',name:' 同事 '});assert.equal(createdGroup.status,200);
  const group=createdGroup.json().group;
  assert.equal((await groupApi({action:'create',name:'同事'})).status,400);
  assert.equal((await groupApi({action:'assign',friendshipId:friendship.id,groupId:foreignGroup.id})).status,400);
  assert.equal((await groupApi({action:'assign',friendshipId:friendship.id,groupId:group.id})).status,200);
  let social=(await request('/api/social',undefined,{session:true})).json();
  assert.equal(social.friends[0].groupId,group.id);
  assert.equal((await groupApi({action:'rename',groupId:group.id,name:'工作伙伴'})).status,200);
  const conversation=(await pool.query("INSERT INTO conversations(user_a_id,user_b_id,created_at) VALUES($1,$2,now()-interval '1 hour') RETURNING id",[a,b])).rows[0];
  const messages=(await pool.query("INSERT INTO direct_messages(conversation_id,sender_id,content,created_at) VALUES($1,$2,'先到的消息',date_trunc('milliseconds',now())-interval '2 seconds'),($1,$2,'后到的消息',date_trunc('milliseconds',now())-interval '1 second') RETURNING id",[conversation.id,peer.id])).rows;
  const readApi=messageId=>request(`/api/social/conversations/${conversation.id}/read`,{messageId},{session:true});
  social=(await request('/api/social',undefined,{session:true})).json();assert.equal(social.unreadCounts.messages,2);
  await request(`/api/social/conversations/${conversation.id}/messages`,undefined,{session:true});
  assert.equal((await request('/api/social',undefined,{session:true})).json().unreadCounts.messages,2,'fetching messages does not mark read');
  assert.equal((await readApi(messages[0].id)).status,204);
  assert.equal((await request('/api/social',undefined,{session:true})).json().unreadCounts.messages,1,'read boundary retains later messages');
  assert.equal((await request(`/api/social/conversations/${conversation.id}/messages`,{content:'我的回复'},{session:true})).status,201);
  assert.equal((await request('/api/social',undefined,{session:true})).json().unreadCounts.messages,1,'sending does not clear unseen incoming messages');
  await readApi(messages[1].id);await readApi(messages[0].id);
  assert.equal((await request('/api/social',undefined,{session:true})).json().unreadCounts.messages,0,'older read receipt never moves boundary backwards');
  const announcement=(await pool.query("INSERT INTO social_announcements(admin_id,content,recipient_count) VALUES($1,'独立通知',1) RETURNING id",[peer.id])).rows[0];
  await pool.query('INSERT INTO social_announcement_recipients(announcement_id,user_id) VALUES($1,$2)',[announcement.id,user.id]);
  assert.equal((await request('/api/social',undefined,{session:true})).json().unreadCounts.announcements,1);
  await readApi(messages[1].id);
  assert.equal((await request('/api/social',undefined,{session:true})).json().unreadCounts.announcements,1,'reading conversation leaves announcement unread');
  await request(`/api/social/announcements/${announcement.id}/read`,{}, {session:true});
  assert.equal((await request('/api/social',undefined,{session:true})).json().unreadCounts.announcements,0);
  assert.equal((await groupApi({action:'delete',groupId:group.id})).status,200);
  assert.equal((await request('/api/social',undefined,{session:true})).json().friends[0].groupId,null,'deleted group retains friendship');
  assert.equal((await pool.query('SELECT count(*) FROM friend_groups WHERE id=$1',[foreignGroup.id])).rows[0].count,'1','other owner unchanged');
  console.log('PASS groups ownership, duplicate names, assignment, rename/delete, cross-device summary; message boundary and separate persistent announcement read');
  const account = await request('/account', undefined, { session: true });
  assert.equal(account.status, 200);
  assert(!/<input[^>]+name="(?:currentPassword|newPassword|confirmPassword)"/.test(account.text), 'account has no direct password-change form');
  if(process.env.ACCOUNT_BROWSER === '1') {
    const {chromium}=require('@playwright/test');const browser=await chromium.launch();
    try {
      const context=await browser.newContext();
      await context.addCookies([...cookies].map(([name,value])=>({name,value,url:'https://xiudou.site',secure:true})));
      await context.route('https://xiudou.site/**',async route=>{
        const url=new URL(route.request().url());
        const response=await route.fetch({url:`http://localhost:${port}${url.pathname}${url.search}`,headers:{...route.request().headers(),Host:'xiudou.site','X-Forwarded-Host':'xiudou.site','X-Forwarded-Proto':'https'}});
        await route.fulfill({response});
      });
      const page=await context.newPage();
      for(const locale of ['zh','en']) for(const width of [360,390,780,1024,1440]){
        await page.setViewportSize({width,height:1000});
        await page.goto(`https://xiudou.site${locale==='en'?'/en':''}/account`,{waitUntil:'networkidle'});
        const avatar=page.locator('form').filter({has:page.locator('input[name="avatar"]')});
        const profile=page.locator('form').filter({has:page.locator('input[name="name"]')});
        await profile.waitFor();
        const left=await avatar.boundingBox(),right=await profile.boundingBox();
        assert(left&&right);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`account overflow ${locale}/${width}`);
        if(width>=780){assert(right.x>left.x+left.width,'nickname occupies right column');assert(Math.abs(left.y-right.y)<2,'forms align at top');assert(right.width>left.width*0.8,'balanced columns');}
        else assert(right.y>left.y+left.height,'mobile stacked forms');
        assert.equal(await page.locator('input[name="currentPassword"]').count(),0);
        await page.screenshot({path:`/tmp/account-layout-${locale}-${width}.png`,fullPage:true});
      }
      await context.close();console.log('PASS authenticated account layout: zh/en, 360/390/780/1024/1440, balanced desktop columns, mobile stack, no overflow');
    } finally {await browser.close();}
  }
  assert.equal((await request('/forgot-password')).status, 200, 'email password recovery remains available');
  await submitWebsiteForm('/forgot-password', 'email', { email });
  const { rows: resetMails } = await pool.query("SELECT payload_enc FROM mail_outbox WHERE template='password_reset' AND recipient=$1", [email]);
  assert.equal(resetMails.length, 1, 'password reset requires an email link');
  const resetToken = new URL(decryptOutboxPayload(resetMails[0].payload_enc).resetUrl).searchParams.get('token');
  assert(resetToken);
  const newPassword = randomBytes(24).toString('base64url') + '!b8';
  const reset = await submitWebsiteForm('/reset-password?token=' + encodeURIComponent(resetToken), 'password', { password: newPassword, confirmPassword: newPassword });
  assert([303, 307].includes(reset.status), 'email reset completes with login redirect');
  const changed = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [user.id])).rows[0].password_hash;
  assert((await verifyPassword(newPassword, changed)).valid);
  assert.equal((await pool.query('SELECT count(*) FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL', [user.id])).rows[0].count, '0', 'password reset revokes sessions');
  assert(!(await request('/api/auth/session', undefined, { session: true })).json()?.user, 'old session cannot authenticate');
  await stop(web); cookies.clear(); await startWeb(false);
  assert.equal((await request('/api/mobile/registration')).json().enabled, false);
  for (const body of [{ action: 'request', email: 'closed@example.invalid' }, { action: 'verify', token }, complete]) assert.equal((await api(body)).status, 403);
  console.log('PASS isolated registration: email proof, cooldown, password policy, expired/replayed tokens, concurrent one-use claim, reader role, login, email-only password reset, session revocation, registration switch');
} catch(error) {
  console.error('Integration failure:',error.message,serverLog.slice(-4000));
  throw error;
} finally {
  await stop(web); await stop(redis);
  if (pool) await pool.end();
  if (created) await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.end();
}
