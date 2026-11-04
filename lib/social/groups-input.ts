import { z } from "zod";
const name = z.string().trim().min(1).max(40);
const groupId = z.string().uuid();
export const groupActionSchema = z.discriminatedUnion("action", [
  z.object({action:z.literal("create"),name}).strict(),
  z.object({action:z.literal("rename"),groupId,name}).strict(),
  z.object({action:z.literal("delete"),groupId}).strict(),
  z.object({action:z.literal("assign"),friendshipId:z.string().uuid(),groupId:groupId.nullable()}).strict(),
]);
export type GroupAction = z.infer<typeof groupActionSchema>;
