import { auth } from "@/auth";
import { isWebSshEnabled } from "@/lib/features";
import { subscribeTerminalSession, WebSshError } from "@/lib/terminal/sessions";

const encoder = new TextEncoder();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isWebSshEnabled()) return Response.json({ error: "Web SSH 未启用。" }, { status: 404 });
  const session = await auth();
  if (!session?.user || session.authState !== "full" || session.user.role !== "admin") {
    return Response.json({ error: "没有访问权限。" }, { status: 403 });
  }
  const { id } = await params;
  const afterEventId = Math.max(0, Number.parseInt(request.headers.get("last-event-id") ?? "0", 10) || 0);
  let cleanup: () => void = () => {};
  let heartbeat: NodeJS.Timeout | undefined;
  let stopped = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stop = () => {
        if (stopped) return;
        stopped = true;
        cleanup();
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };
      try {
        cleanup = subscribeTerminalSession(id, session.user.id, afterEventId, ({ id: eventId, event }) => {
          if (!stopped) controller.enqueue(encoder.encode(`id: ${eventId}\ndata: ${JSON.stringify(event)}\n\n`));
        });
        controller.enqueue(encoder.encode(": connected\n\n"));
        heartbeat = setInterval(() => {
          if (!stopped) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15_000);
        heartbeat.unref();
        request.signal.addEventListener("abort", stop, { once: true });
      } catch (error) {
        const event = error instanceof WebSshError
          ? { type: "exit", message: error.message }
          : { type: "exit", message: "无法读取终端输出。" };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        stop();
      }
    },
    cancel() {
      stopped = true;
      cleanup();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
