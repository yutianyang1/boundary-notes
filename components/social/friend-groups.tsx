"use client";
import {useState} from "react";
type Friend={id:string;peerName:string;groupId?:string|null};
type Group={id:string;name:string};
export function FriendGroups<T extends Friend>({friends,groups,busy,change,render}:{friends:T[];groups:Group[];busy:boolean;change:(body:unknown)=>Promise<void>;render:(friend:T)=>React.ReactNode}){
  const [query,setQuery]=useState("");const [filter,setFilter]=useState("all");const [name,setName]=useState("");
  return <>
    <input aria-label="查找已有好友" placeholder="搜索好友昵称" value={query} onChange={e=>setQuery(e.target.value)} className="my-2 h-9 w-full rounded-lg border bg-background px-3 text-sm"/>
    <div className="mb-2 flex gap-2"><select aria-label="筛选好友分组" value={filter} onChange={e=>setFilter(e.target.value)} className="min-w-0 flex-1 rounded-lg border bg-background p-2 text-xs"><option value="all">全部好友</option><option value="ungrouped">未分组</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
      {filter!=="all"&&filter!=="ungrouped"?<><button disabled={busy} className="text-xs" onClick={()=>{const next=window.prompt("重命名分组",groups.find(g=>g.id===filter)?.name);if(next?.trim())void change({action:"rename",groupId:filter,name:next});}}>重命名</button><button disabled={busy} className="text-xs" onClick={()=>{if(window.confirm("删除分组后，好友会回到未分组，好友关系保留。")){void change({action:"delete",groupId:filter});setFilter("all");}}}>删除分组</button></>:null}
    </div>
    <form onSubmit={async e=>{e.preventDefault();await change({action:"create",name});setName("");}} className="mb-2 flex gap-2"><input aria-label="新分组名称" value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder="新分组名称" className="min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs"/><button disabled={busy||!name.trim()} className="rounded-lg border p-2 text-xs">新建分组</button></form>
    {[{id:"ungrouped",name:"未分组"},...groups].filter(g=>filter==="all"||filter===g.id).map(g=>{
      const items=friends.filter(f=>(f.groupId??"ungrouped")===g.id&&f.peerName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>a.peerName.localeCompare(b.peerName));
      return <details key={g.id} open className="mb-2 rounded-lg border p-2"><summary className="cursor-pointer text-xs font-semibold">{g.name} · {items.length}</summary>{items.map(f=><div key={f.id} className="border-b py-2">{render(f)}<select aria-label={`移动 ${f.peerName} 到分组`} disabled={busy} value={f.groupId??""} onChange={e=>void change({action:"assign",friendshipId:f.id,groupId:e.target.value||null})} className="mt-2 w-full rounded border bg-background p-1 text-xs"><option value="">未分组</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></div>)}{!items.length?<p className="py-2 text-xs text-muted-foreground">暂无匹配好友</p>:null}</details>;
    })}
  </>;
}
