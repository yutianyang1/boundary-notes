import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { invalidateUserSessionCache } from "@/lib/auth/session-registry";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import {
  avatarDirectory,
  isManagedAvatarUrl,
  MAX_AVATAR_BYTES,
  prepareAvatar,
} from "@/lib/uploads/avatar";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择头像文件。" }, { status: 400 });
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "头像不能超过 2 MB。" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = await prepareAvatar(bytes);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { extension } = validation.image;
  const filename = `${crypto.randomUUID()}.${extension}`;
  const directory = avatarDirectory();
  const target = path.join(directory, filename);
  const url = `/media/avatars/${filename}`;

  await mkdir(directory, { recursive: true });
  await writeFile(target, validation.image.bytes, { flag: "wx", mode: 0o640 });

  let committed = false;
  try {
    const [previous] = await db
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ image: url, updatedAt: new Date() }).where(eq(users.id, session.user.id));
      await tx.insert(auditLogs).values({
        actorId: session.user.id,
        action: "account.avatar.update",
        targetType: "user",
        targetId: session.user.id,
      });
    });
    committed = true;

    if (isManagedAvatarUrl(previous?.image)) {
      const oldName = previous!.image!.split("/").at(-1)!;
      await unlink(path.join(directory, oldName)).catch(() => undefined);
    }
    await invalidateUserSessionCache(session.user.id).catch(() => undefined);
  } catch (error) {
    if (!committed) await unlink(target).catch(() => undefined);
    throw error;
  }

  return NextResponse.json({ url });
}
