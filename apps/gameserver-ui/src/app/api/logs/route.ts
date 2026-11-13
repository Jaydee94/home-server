import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { buildContainerLogsCommand } from "@/lib/logs";

export const dynamic = "force-dynamic";

// Schutz gegen eine Endlos-"Zeile" ohne Zeilenumbruch: ab dieser Länge wird der
// Puffer als eigene Zeile ausgeliefert, statt weiter zu wachsen.
const MAX_LINE_CHARS = 64 * 1024;

export async function GET(req: Request) {
  let status;
  try {
    status = await VmClient.inCluster().getStatus();
  } catch {
    return new Response("K8s nicht erreichbar", { status: 503 });
  }

  if (!status || status.vmiPhase !== "Running" || !status.ipAddress) {
    return new Response("VM läuft nicht", { status: 503 });
  }

  // Client ist schon weg → gar keine SSH-Session mehr aufbauen.
  if (req.signal.aborted) return new Response(null, { status: 204 });

  const ssh = SshClient.fromEnv(status.ipAddress);
  const reader = ssh.stream(buildContainerLogsCommand()).getReader();

  // Der VM-Stream ist durch den Reader gesperrt — abgebrochen wird deshalb über
  // den Reader (vmStream.cancel() würde mit "ReadableStream is locked" scheitern).
  // Das beendet in SshClient.stream die SSH-Verbindung samt `docker logs -f`.
  const stop = () => {
    req.signal.removeEventListener("abort", stop);
    reader.cancel().catch(() => undefined);
  };
  req.signal.addEventListener("abort", stop);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let pending = ""; // angefangene Zeile, deren Rest im nächsten Chunk kommt
  const sse = (line: string) => encoder.encode(`data: ${line}\n\n`);

  const body = new ReadableStream<Uint8Array>({
    // pull-basiert: gelesen wird nur, wenn der Client auch abnimmt (Backpressure
    // bis in den SSH-Kanal statt unbegrenztem Puffern im Pod).
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            pending += decoder.decode();
            if (pending.trim()) controller.enqueue(sse(pending));
            req.signal.removeEventListener("abort", stop);
            controller.close();
            return;
          }
          // {stream: true}: Multibyte-Zeichen über Chunk-Grenzen korrekt dekodieren.
          const lines = (pending + decoder.decode(value, { stream: true })).split("\n");
          pending = lines.pop() ?? "";
          if (pending.length > MAX_LINE_CHARS) {
            lines.push(pending);
            pending = "";
          }
          let sent = false;
          for (const line of lines) {
            if (!line.trim()) continue;
            controller.enqueue(sse(line));
            sent = true;
          }
          // Ohne ausgelieferte Zeile würde pull() nicht erneut aufgerufen.
          if (sent) return;
        }
      } catch (e) {
        stop();
        try {
          controller.error(e);
        } catch {
          /* Stream wurde bereits vom Client abgebrochen */
        }
      }
    },
    cancel() {
      stop();
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
