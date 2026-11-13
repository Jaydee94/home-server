import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
vi.mock("@/lib/k8s", () => ({
  VmClient: { inCluster: () => ({ getStatus }) },
}));

const mockStream = vi.fn();
vi.mock("@/lib/ssh", () => ({
  SshClient: { fromEnv: () => ({ stream: mockStream }) },
}));

import { GET } from "@/app/api/logs/route";

beforeEach(() => vi.clearAllMocks());

const req = (signal?: AbortSignal) => new Request("http://x/api/logs", { signal });

// VM-Stream, dessen Chunks der Test von Hand einspeist; `cancelled` zeigt, ob die
// Route den Abbruch bis zur SSH-Schicht durchreicht.
function controllableVmStream() {
  const encoder = new TextEncoder();
  const cancelled = vi.fn();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c; },
    cancel: cancelled,
  });
  return {
    stream,
    cancelled,
    push: (s: string | Uint8Array) => ctrl.enqueue(typeof s === "string" ? encoder.encode(s) : s),
    close: () => ctrl.close(),
  };
}

describe("/api/logs", () => {
  it("liefert 503 wenn K8s nicht erreichbar", async () => {
    getStatus.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("K8s nicht erreichbar");
  });

  it("liefert 503 wenn VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("VM läuft nicht");
  });

  it("liefert 503 wenn VM läuft aber keine IP hat", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: null });
    const res = await GET(req());
    expect(res.status).toBe(503);
  });

  it("liefert SSE-Stream wenn VM läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });

    const encoder = new TextEncoder();
    mockStream.mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("Zeile 1\nZeile 2\n"));
          controller.close();
        },
      })
    );

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");

    const text = await res.text();
    expect(text).toContain("data: Zeile 1");
    expect(text).toContain("data: Zeile 2");
  });

  it("SSE-Einträge enden mit doppeltem Newline", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });

    const encoder = new TextEncoder();
    mockStream.mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("Hallo Welt\n"));
          controller.close();
        },
      })
    );

    const res = await GET(req());
    const text = await res.text();
    expect(text).toBe("data: Hallo Welt\n\n");
  });

  it("setzt Zeilen zusammen, die an Chunk-Grenzen zerrissen wurden", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });
    const vm = controllableVmStream();
    mockStream.mockReturnValue(vm.stream);

    const res = await GET(req());
    vm.push("Zei");
    vm.push("le 1\nZeile");
    vm.push(" 2\n");
    vm.close();
    expect(await res.text()).toBe("data: Zeile 1\n\ndata: Zeile 2\n\n");
  });

  it("dekodiert Multibyte-Zeichen, die über zwei Chunks verteilt sind", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });
    const vm = controllableVmStream();
    mockStream.mockReturnValue(vm.stream);

    const res = await GET(req());
    const bytes = new TextEncoder().encode("Grüße\n");
    vm.push(bytes.slice(0, 3)); // trennt mitten im "ü"
    vm.push(bytes.slice(3));
    vm.close();
    expect(await res.text()).toBe("data: Grüße\n\n");
  });

  it("liefert eine letzte Zeile ohne abschließenden Zeilenumbruch", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });
    const vm = controllableVmStream();
    mockStream.mockReturnValue(vm.stream);

    const res = await GET(req());
    vm.push("ohne Newline");
    vm.close();
    expect(await res.text()).toBe("data: ohne Newline\n\n");
  });

  it("bricht den VM-Stream ab, wenn der Client den Response-Body cancelt", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });
    const vm = controllableVmStream();
    mockStream.mockReturnValue(vm.stream);

    const res = await GET(req());
    const reader = res.body!.getReader();
    vm.push("Zeile 1\n");
    await reader.read();
    expect(vm.cancelled).not.toHaveBeenCalled();

    await reader.cancel();
    expect(vm.cancelled).toHaveBeenCalled();
  });

  it("bricht den VM-Stream ab, wenn die Anfrage abgebrochen wird (req.signal)", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });
    const vm = controllableVmStream();
    mockStream.mockReturnValue(vm.stream);
    const ac = new AbortController();

    const res = await GET(req(ac.signal));
    const reader = res.body!.getReader();
    vm.push("Zeile 1\n");
    await reader.read();

    ac.abort();
    await new Promise((r) => setTimeout(r, 0));
    expect(vm.cancelled).toHaveBeenCalled();
    // Der Response-Stream endet sauber statt offen zu bleiben.
    expect((await reader.read()).done).toBe(true);
  });

  it("öffnet keinen VM-Stream, wenn die Anfrage schon abgebrochen ist", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.5" });
    const ac = new AbortController();
    ac.abort();

    await GET(req(ac.signal));
    expect(mockStream).not.toHaveBeenCalled();
  });
});
