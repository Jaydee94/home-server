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

describe("/api/logs", () => {
  it("liefert 503 wenn K8s nicht erreichbar", async () => {
    getStatus.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("K8s nicht erreichbar");
  });

  it("liefert 503 wenn VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("VM läuft nicht");
  });

  it("liefert 503 wenn VM läuft aber keine IP hat", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: null });
    const res = await GET();
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

    const res = await GET();
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

    const res = await GET();
    const text = await res.text();
    expect(text).toBe("data: Hallo Welt\n\n");
  });
});
