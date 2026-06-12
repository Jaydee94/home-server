import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";

export const dynamic = "force-dynamic";

export async function GET() {
  let status;
  try {
    status = await VmClient.inCluster().getStatus();
  } catch {
    return new Response("K8s nicht erreichbar", { status: 503 });
  }

  if (!status || status.vmiPhase !== "Running" || !status.ipAddress) {
    return new Response("VM läuft nicht", { status: 503 });
  }

  const ssh = SshClient.fromEnv(status.ipAddress);
  const vmStream = ssh.stream("sudo docker logs -f --tail=500 7dtd-server 2>&1");

  const body = new ReadableStream({
    start(controller) {
      const reader = vmStream.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      function pump(): void {
        reader.read().then(({ done, value }) => {
          if (done) { controller.close(); return; }
          const lines = decoder.decode(value).split("\n");
          for (const line of lines) {
            if (line.trim()) controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          }
          pump();
        }).catch(e => controller.error(e));
      }
      pump();
    },
    cancel() {
      vmStream.cancel();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
