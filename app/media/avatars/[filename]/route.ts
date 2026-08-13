import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { avatarDirectory } from "@/lib/uploads/avatar";
import { mediaResponseHeaders } from "@/lib/uploads/image";

const filenamePattern = /^[0-9a-f-]{36}\.(jpg|png|webp|avif)$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const match = filename.match(filenamePattern);
  if (!match) notFound();

  const headers = mediaResponseHeaders(match[1]);
  if (!headers) notFound();

  try {
    const bytes = await readFile(path.join(avatarDirectory(), filename));
    return new Response(bytes, { headers });
  } catch {
    notFound();
  }
}
