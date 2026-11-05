import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const{chromium}=require('@playwright/test');
const manifest=JSON.parse(fs.readFileSync(new URL('../../docs/articles/kimi-k31-pro/manifest.json',import.meta.url),'utf8'));
const base=process.env.BASE_URL??'http://localhost:3000';const preview=process.argv.includes('--preview');
const browser=await chromium.launch();
try{
  for(const [width,theme] of [[390,'light'],[1440,'dark']]){
    const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.setDefaultNavigationTimeout(60000);
    if(preview)await page.goto(base+'/posts/kimi-delta-attention',{waitUntil:'networkidle'});
    for(const article of manifest.articles){
      if(preview){
        const html=fs.readFileSync(`/tmp/kimi-k31-pro-review-20261105/${article.slug}.html`,'utf8');
        await page.locator('[data-article-body]').evaluate((el,content)=>{el.innerHTML=content},html);
        await page.locator('main h1').first().evaluate((el,title)=>{el.textContent=title},article.title);
      }else{
        const response=await page.goto(base+'/posts/'+article.slug,{waitUntil:'networkidle'});assert.equal(response.status(),200);
        assert.equal(await page.locator('main h1').textContent(),article.title);
        assert((await page.locator('link[rel="canonical"]').getAttribute('href')).endsWith('/posts/'+article.slug));
      }
      await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0)});
      const body=page.locator('[data-article-body]');await body.waitFor();
      assert.equal(await page.locator('main h1').count(),1,'single page title');
      assert.equal(await body.locator('.katex-error').count(),0,'valid math');
      assert(await body.locator('figure.mermaid-diagram').count()>=1,'diagram present');
      assert(await body.locator('a[href^="https://"]').count()>=2,'source links present');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${article.slug}/${width} page overflow`);
      for(const figure of await body.locator('figure.mermaid-diagram').all()){
        const visible=figure.locator(theme==='dark'?'.mermaid-dark svg':'.mermaid-light svg');assert(await visible.isVisible());
        const box=await visible.boundingBox();assert(box.width>100&&box.height>100,'diagram has usable dimensions');
      }
      if(!preview){
        const links=await body.locator('h2[id],h3[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(links.length,new Set(links).size);
        assert(await page.locator(`a[href="/series/${manifest.series.slug}"]`).count()>=1,'series navigation present');
      }
      await page.screenshot({path:`/tmp/kimi-k31-${preview?'preview':'published'}-${article.slug}-${width}.png`,fullPage:true});
      if(article.slug==='kimi-k31-pro-gated-dsa'&&width===390){await body.locator('figure.mermaid-diagram').first().scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/kimi-k31-diagram-detail.png'});}
      console.log(`PASS ${preview?'preview':'published'} ${article.slug} ${width}px/${theme}: layout, math, diagrams, sources`);
    }
    assert.deepEqual(errors,[]);await context.close();
  }
}finally{await browser.close();}
