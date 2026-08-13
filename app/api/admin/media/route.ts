import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLogs, mediaAssets, users } from "@/lib/db/schema";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { canAccessMediaLibrary } from "@/lib/uploads/media-access";
import {
  MAX_MEDIA_BYTES,
  mediaDirectory,
  validateMediaImage,
} from "@/lib/uploads/media";

function forbidden() {
  return NextResponse.json({ error: "没有访问媒体库的权限。" }, { status: 403 });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user || !canAccessMediaLibrary(session.user.role)) return forbidden();

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择图片文件。" }, { status: 400 });
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "图片不能超过 8 MB。" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = await validateMediaImage(bytes);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const filename = `${crypto.randomUUID()}.${validation.image.extension}`;
  const url = `/media/library/${filename}`;
  const directory = mediaDirectory();
  const target = path.join(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(target, validation.image.bytes, { flag: "wx", mode: 0o640 });

  try {
    const [asset] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(mediaAssets).values({
        filename,
        url,
        mimeType: validation.image.contentType,
        width: validation.image.width,
        height: validation.image.height,
        byteSize: validation.image.bytes.byteLength,
        uploadedBy: session.user.id,
      }).returning({
        id: mediaAssets.id,
        url: mediaAssets.url,
        width: mediaAssets.width,
        height: mediaAssets.height,
      });

      await tx.insert(auditLogs).values({
        actorId: session.user.id,
        action: "media.upload",
        targetType: "media",
        targetId: created.id,
        after: { filename, url, byteSize: validation.image.bytes.byteLength },
      });
      return [created];
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canAccessMediaLibrary(session.user.role)) return forbidden();

  const url = new URL(request.url);
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const requestedPageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "24", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(60, Math.max(1, requestedPageSize))
    : 24;
  const ownerFilter = session.user.role === "admin"
    ? isNull(mediaAssets.deletedAt)
    : and(isNull(mediaAssets.deletedAt), eq(mediaAssets.uploadedBy, session.user.id));

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: mediaAssets.id,
        filename: mediaAssets.filename,
        url: mediaAssets.url,
        mimeType: mediaAssets.mimeType,
        width: mediaAssets.width,
        height: mediaAssets.height,
        byteSize: mediaAssets.byteSize,
        title: mediaAssets.title,
        alt: mediaAssets.alt,
        uploadedBy: mediaAssets.uploadedBy,
        uploaderName: users.name,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .leftJoin(users, eq(mediaAssets.uploadedBy, users.id))
      .where(ownerFilter)
      .orderBy(desc(mediaAssets.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: count() }).from(mediaAssets).where(ownerFilter),
  ]);

  return NextResponse.json({
    items,
    pagination: {
      page,
      pageSize,
      total: totalRows[0]?.count ?? 0,
    },
  });
}
