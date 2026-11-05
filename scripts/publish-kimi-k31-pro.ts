import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { z } from "zod";
import { db, pool } from "@/lib/db";
import { auditLogs, categories, postRevisions, posts, postTags, series, tags, users } from "@/lib/db/schema";
import { renderMarkdown, rendererVersion } from "@/lib/markdown/render";
import { normalizeSlug } from "@/lib/posts/slug";

const directory=path.resolve("docs/articles/kimi-k31-pro");
const reviewDirectory="/tmp/kimi-k31-pro-review-20261105";
const slug=z.string().regex(/^[a-z0-9-]+$/);
const manifestSchema=z.object({
  verifiedAt:z.literal("2026-11-05"),
  series:z.object({slug,name:z.string().min(1).max(120),nameEn:z.string().max(120),description:z.string(),descriptionEn:z.string()}),
  articles:z.array(z.object({slug:slug.regex(/^kimi-k31-pro-/),title:z.string().min(1).max(240),summary:z.string().min(20).max(1000),
    category:z.object({slug,name:z.string(),nameEn:z.string()}),tags:z.array(z.string().min(1).max(40)).min(1).max(8),file:z.string().regex(/^[a-z0-9-]+\.md$/)})).length(5),
});

async function main(){
  const svgdom=createRequire(import.meta.url)("svgdom") as {setFontDir:(directory:string)=>unknown;setFontFamilyMappings:(fonts:Record<string,string>)=>unknown};
  svgdom.setFontDir(path.resolve("assets/fonts"));
  svgdom.setFontFamilyMappings({"Noto Sans SC Variable":"NotoSansSC-Bold.ttf","sans-serif":"NotoSansSC-Bold.ttf","Open Sans":"NotoSansSC-Bold.ttf"});
  const manifest=manifestSchema.parse(JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8")));
  assert.equal(new Set(manifest.articles.map(a=>a.slug)).size,5);
  const prepared:Array<z.infer<typeof manifestSchema>["articles"][number]&{contentMd:string;contentHtml:string;sourceHash:string}>=[];
  for(const article of manifest.articles){
    const original=await readFile(path.join(directory,article.file),"utf8");
    assert.equal(original.split(/\r?\n/)[0],`# ${article.title}`);
    const contentMd=original.replace(/^# [^\n]+\n/,"").trimStart();
    assert(contentMd.length>1400&&contentMd.includes("## 资料与后续阅读"),`${article.slug}: incomplete article`);
    const contentHtml=await renderMarkdown(contentMd);
    const dom=new JSDOM(contentHtml);const doc=dom.window.document;
    assert.equal(doc.querySelectorAll("h1").length,0,"the page supplies its own H1");
    assert(doc.querySelectorAll("h2").length>=5);
    assert.equal(doc.querySelectorAll(".katex-error").length,0,"math must render successfully");
    const diagrams=[...doc.querySelectorAll("figure.mermaid-diagram")];
    assert(diagrams.length>=1,`${article.slug}: missing rendered diagram`);
    for(const figure of diagrams){assert(figure.querySelector(".mermaid-light svg"));assert(figure.querySelector(".mermaid-dark svg"));}
    assert(doc.querySelectorAll('a[href^="https://"]').length>=2,"source links are required");
    const ids=[...doc.querySelectorAll("h2[id],h3[id]")].map(h=>h.id);assert.equal(ids.length,new Set(ids).size);
    dom.window.close();
    prepared.push({...article,contentMd,contentHtml,sourceHash:createHash("sha256").update(contentMd).digest("hex")});
  }
  const digest=createHash("sha256").update(JSON.stringify(manifest)+prepared.map(a=>a.sourceHash).join(":" )+rendererVersion).digest("hex");
  if(!process.argv.includes("--publish")){
    await mkdir(reviewDirectory,{recursive:true});
    for(const article of prepared)await writeFile(path.join(reviewDirectory,`${article.slug}.html`),article.contentHtml);
    await writeFile(path.join(reviewDirectory,"plan.json"),JSON.stringify({digest,rendererVersion,series:manifest.series,articles:prepared.map(({slug,title,sourceHash,contentMd})=>({slug,title,sourceHash,characters:contentMd.length}))},null,2));
    console.log(JSON.stringify({mode:"check",digest,reviewDirectory,articles:prepared.map(a=>({slug:a.slug,characters:a.contentMd.length}))},null,2));
    return;
  }
  const reviewed=JSON.parse(await readFile(path.join(reviewDirectory,"plan.json"),"utf8"));
  assert.equal(reviewed.digest,digest,"Content changed since review; run --check again");
  const result=await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('content:kimi-k31-pro:20261105'))`);
    const authors=await tx.select({id:users.id,name:users.name}).from(users).where(and(eq(users.role,"admin"),isNull(users.disabledAt),isNull(users.deletedAt)));
    assert.equal(authors.length,1,"Expected exactly one active admin author");const author=authors[0];
    const existing=await tx.select().from(posts).where(and(inArray(posts.slug,prepared.map(a=>a.slug)),isNull(posts.deletedAt)));
    for(const row of existing){const article=prepared.find(a=>a.slug===row.slug)!;
      assert(row.status==="published"&&row.contentMd===article.contentMd&&row.title===article.title,"Existing content differs; refusing to overwrite it");
    }
    let [collection]=await tx.select().from(series).where(and(eq(series.slug,manifest.series.slug),isNull(series.deletedAt)));
    if(!collection){[collection]=await tx.insert(series).values({...manifest.series}).returning();
      await tx.insert(auditLogs).values({actorId:author.id,action:"series.create",targetType:"series",targetId:collection.id,after:{slug:collection.slug,source:"kimi-k31-research"}});
    }
    const published=[];
    for(const [index,article] of prepared.entries()){
      const old=existing.find(row=>row.slug===article.slug);
      if(old){assert.equal(old.seriesId,collection.id);published.push({slug:old.slug,id:old.id,operation:"unchanged"});continue;}
      let [category]=await tx.select().from(categories).where(and(eq(categories.slug,article.category.slug),isNull(categories.deletedAt)));
      if(!category){[category]=await tx.insert(categories).values(article.category).returning();
        await tx.insert(auditLogs).values({actorId:author.id,action:"category.create",targetType:"category",targetId:category.id,after:{slug:category.slug,source:"kimi-k31-research"}});
      }
      const publishedAt=new Date();
      const [created]=await tx.insert(posts).values({slug:article.slug,title:article.title,summary:article.summary,contentMd:article.contentMd,contentHtml:article.contentHtml,
        rendererVersion,cover:null,status:"published",pinned:false,authorId:author.id,categoryId:category.id,seriesId:collection.id,seriesOrder:index+1,
        revision:1,seoTitle:article.title,seoDescription:article.summary,publishedAt}).returning({id:posts.id});
      for(const name of article.tags){
        const tagSlug=normalizeSlug(name);assert(tagSlug);
        let [tag]=await tx.select().from(tags).where(and(eq(tags.slug,tagSlug),isNull(tags.deletedAt)));
        if(!tag)[tag]=await tx.insert(tags).values({slug:tagSlug,name}).returning();
        await tx.insert(postTags).values({postId:created.id,tagId:tag.id});
      }
      await tx.insert(postRevisions).values({postId:created.id,revision:1,title:article.title,summary:article.summary,contentMd:article.contentMd,status:"published",seriesId:collection.id,seriesOrder:index+1,isPublishedVersion:true,createdBy:author.id});
      await tx.insert(auditLogs).values({actorId:author.id,action:"post.create",targetType:"post",targetId:created.id,after:{slug:article.slug,title:article.title,status:"published",source:"kimi-k31-research",sourceHash:article.sourceHash,verifiedAt:manifest.verifiedAt,seriesId:collection.id,seriesOrder:index+1}});
      published.push({id:created.id,slug:article.slug,operation:"created"});
    }
    return {author:author.name,series:collection.slug,articles:published};
  });
  console.log(JSON.stringify({mode:"published",...result},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
