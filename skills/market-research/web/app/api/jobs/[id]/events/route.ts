import { getJobEmitter, type ProgressEvent } from "@/lib/job-runner";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const emitter = getJobEmitter(id);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const handler = (data: ProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          if (data.done) {
            setTimeout(() => {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            }, 500);
          }
        } catch {
          // Stream closed by client
          emitter.off("progress", handler);
        }
      };

      emitter.on("progress", handler);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        emitter.off("progress", handler);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
