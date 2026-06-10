import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
const setRunStrategy = vi.fn();
vi.mock("@/lib/k8s", () => ({
  VmClient: { inCluster: () => ({ getStatus, setRunStrategy }) },
}));

import { GET, POST } from "@/app/api/vm/route";

beforeEach(() => vi.clearAllMocks());

describe("/api/vm", () => {
  it("GET liefert den VM-Status", async () => {
    getStatus.mockResolvedValue({ runStrategy: "Halted", vmiPhase: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runStrategy: "Halted", vmiPhase: null });
  });

  it("GET liefert 502 wenn die K8s-API nicht erreichbar ist", async () => {
    getStatus.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("POST start setzt runStrategy=Always", async () => {
    setRunStrategy.mockResolvedValue(undefined);
    const res = await POST(
      new Request("http://x/api/vm", { method: "POST", body: JSON.stringify({ action: "start" }) })
    );
    expect(res.status).toBe(200);
    expect(setRunStrategy).toHaveBeenCalledWith("Always");
  });

  it("POST stop setzt runStrategy=Halted", async () => {
    setRunStrategy.mockResolvedValue(undefined);
    const res = await POST(
      new Request("http://x/api/vm", { method: "POST", body: JSON.stringify({ action: "stop" }) })
    );
    expect(res.status).toBe(200);
    expect(setRunStrategy).toHaveBeenCalledWith("Halted");
  });

  it("POST mit unbekannter Action liefert 400", async () => {
    const res = await POST(
      new Request("http://x/api/vm", { method: "POST", body: JSON.stringify({ action: "explode" }) })
    );
    expect(res.status).toBe(400);
    expect(setRunStrategy).not.toHaveBeenCalled();
  });
});
