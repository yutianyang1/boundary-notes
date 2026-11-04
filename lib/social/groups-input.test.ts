import {test} from "node:test";
import assert from "node:assert/strict";
import {groupActionSchema} from "./groups-input";
test("group mutations reject owner overrides, empty names, and invalid assignment",()=>{
  assert(!groupActionSchema.safeParse({action:"create",name:"   "}).success);
  assert(!groupActionSchema.safeParse({action:"create",name:"a".repeat(41)}).success);
  assert(!groupActionSchema.safeParse({action:"create",name:"好友",userId:"other"}).success);
  assert(!groupActionSchema.safeParse({action:"assign",friendshipId:"bad",groupId:null}).success);
  const parsed=groupActionSchema.parse({action:"create",name:" 同事 "});
  assert(parsed.action==="create");assert.equal(parsed.name,"同事");
});
