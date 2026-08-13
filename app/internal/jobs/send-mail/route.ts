import { processMailOutbox } from "@/lib/mail/worker";

export async function POST(request: Request) {
  const expected = process.env.JOB_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("Not found", { status: 404 });
  }
  const processed = await processMailOutbox();
  return Response.json({ processed });
}
