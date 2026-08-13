import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLogs, mediaAssets } from "@/lib/db/schema";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import {
  canAccessMediaLibrary,
  canManageMediaAsset,
} from "@/lib/uploads/media-access";

type RouteContext = { params: Promise<{ id: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function forbidden() {
  return NextResponse.json({ error: "没有管理该媒体的权限。" }, { status: 403 });
}

async function findActiveAsset(id: string) {
  const [asset] = await db
    .select({
      id: mediaAssets.id,
      uploadedBy: mediaAssets.uploadedBy,
      title: mediaAssets.title,
      alt: mediaAssets.alt,
      url: mediaAssets.url,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
    .limit(1);
  return asset;
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user || !canAccessMediaLibrary(session.user.role)) return forbidden();

  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "媒体不存在。" }, { status: 404 });
  const asset = await findActiveAsset(id);
  if (!asset) return NextResponse.json({ error: "媒体不存在。" }, { status: 404 });
  if (!canManageMediaAsset(session.user, asset.uploadedBy)) return forbidden();

  await db.transaction(async (tx) => {
    await tx
      .update(mediaAssets)
      .set({ deletedAt: new Date() })
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)));
    await tx.insert(auditLogs).values({
      actorId: session.user.id,
      action: "media.delete",
      targetType: "media",
      targetId: id,
      before: { url: asset.url },
      after: { deletedAt: new Date().toISOString() },
    });
  });

  // 只从媒体库隐藏，保留物理文件，避免打碎已发布文章里的引用。
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user || !canAccessMediaLibrary(session.user.role)) return forbidden();

  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "媒体不存在。" }, { status: 404 });
  const asset = await findActiveAsset(id);
  if (!asset) return NextResponse.json({ error: "媒体不存在。" }, { status: 404 });
  if (!canManageMediaAsset(session.user, asset.uploadedBy)) return forbidden();

  const body = await request.json().catch(() => null) as { alt?: unknown; title?: unknown } | null;
  if (!body || (body.alt !== undefined && typeof body.alt !== "string")
    || (body.title !== undefined && typeof body.title !== "string")) {
    return NextResponse.json({ error: "提交内容无效。" }, { status: 400 });
  }

  const alt = typeof body.alt === "string" ? body.alt.trim().slice(0, 500) || null : asset.alt;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) || null : asset.title;
  const [updated] = await db
    .update(mediaAssets)
    .set({ alt, title })
    .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
    .returning({ id: mediaAssets.id, alt: mediaAssets.alt, title: mediaAssets.title });

  return NextResponse.json(updated);
}
