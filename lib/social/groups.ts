import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendGroups, friendGroupMembers, friendships, users } from "@/lib/db/schema";
import type { GroupAction } from "./groups-input";

export async function changeFriendGroup(userId: string, action: GroupAction) {
  return db.transaction(async tx => {
    // Serialize mutations per owner, including the limit and assignment/delete races.
    await tx.select({id:users.id}).from(users).where(eq(users.id,userId)).for("update");
    if(action.action === "create") {
      const existing = await tx.select({id:friendGroups.id}).from(friendGroups).where(eq(friendGroups.userId,userId)).orderBy(asc(friendGroups.name));
      if(existing.length >= 30) throw new Error("最多创建 30 个分组。");
      const [group] = await tx.insert(friendGroups).values({userId,name:action.name}).onConflictDoNothing().returning();
      if(!group) throw new Error("分组名称已存在。");
      return {group};
    }
    if(action.groupId) {
      const [group] = await tx.select().from(friendGroups).where(and(eq(friendGroups.id,action.groupId),eq(friendGroups.userId,userId)));
      if(!group) throw new Error("分组不存在。");
    }
    if(action.action === "rename") {
      const [duplicate] = await tx.select().from(friendGroups).where(and(eq(friendGroups.userId,userId),eq(friendGroups.name,action.name),sql`${friendGroups.id} <> ${action.groupId}`));
      if(duplicate) throw new Error("分组名称已存在。");
      await tx.update(friendGroups).set({name:action.name}).where(and(eq(friendGroups.id,action.groupId),eq(friendGroups.userId,userId)));
    } else if(action.action === "delete") {
      // Cascading membership deletion returns friends to the ungrouped list.
      await tx.delete(friendGroups).where(and(eq(friendGroups.id,action.groupId),eq(friendGroups.userId,userId)));
    } else {
      const [friend] = await tx.select().from(friendships).where(and(eq(friendships.id,action.friendshipId),eq(friendships.status,"accepted"),or(eq(friendships.userAId,userId),eq(friendships.userBId,userId)))).for("update");
      if(!friend) throw new Error("好友关系不存在。");
      if(action.groupId) await tx.insert(friendGroupMembers).values({userId,friendshipId:friend.id,groupId:action.groupId}).onConflictDoUpdate({target:[friendGroupMembers.userId,friendGroupMembers.friendshipId],set:{groupId:action.groupId}});
      else await tx.delete(friendGroupMembers).where(and(eq(friendGroupMembers.userId,userId),eq(friendGroupMembers.friendshipId,friend.id)));
    }
    return {ok:true};
  });
}
