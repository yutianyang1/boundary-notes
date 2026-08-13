import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import {
  managedImageFilenamePattern,
  mediaResponseHeaders,
} from "@/lib/uploads/image";
import { mediaDirectory } from "@/lib/uploads/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const match = filename.match(managedImageFilenamePattern);
  if (!match) notFound();

  const headers = mediaResponseHeaders(match[1]);
  if (!headers) notFound();

  try {
    const bytes = await readFile(path.join(mediaDirectory(), filename));
    return new Response(bytes, { headers });
  } catch {
    notFound();
  }
}
