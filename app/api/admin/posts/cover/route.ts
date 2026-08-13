import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  coverDirectory,
  inspectCover,
  MAX_COVER_BYTES,
} from "@/lib/uploads/cover";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    try {
      if (!host || new URL(origin).host !== host) {
        return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
    }
  }

  const session = await auth();
  if (!session?.user || session.user.role === "reader") {
    return NextResponse.json({ error: "没有上传文章封面的权限。" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择封面文件。" }, { status: 400 });
  }
  if (file.size > MAX_COVER_BYTES) {
    return NextResponse.json({ error: "封面不能超过 8 MB。" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = await inspectCover(bytes);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 },
    );
  }

  const image = validation.image;
  const filename = `${crypto.randomUUID()}.${image.extension}`;
  const directory = coverDirectory();
  const target = path.join(directory, filename);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(target, image.bytes, { flag: "wx", mode: 0o640 });
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }

  return NextResponse.json({
    url: `/media/covers/${filename}`,
    width: image.width,
    height: image.height,
  });
}
