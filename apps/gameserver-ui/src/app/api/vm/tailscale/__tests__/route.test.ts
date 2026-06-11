import { describe, it, expect, vi, beforeEach } from "vitest";

const { getStatus, mockExec, mockFromEnv } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  mockExec: vi.fn(),
  mockFromEnv: vi.fn(),
}));

vi.mock("@/lib/k8s", () => ({
  VmClient: { inCluster: () => ({ getStatus }) },
}));

vi.mock("@/lib/ssh", () => ({
  SshClient: { fromEnv: mockFromEnv },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFromEnv.mockReturnValue({ exec: mockExec });
});

import { GET } from "@/app/api/vm/tailscale/route";

describe("/api/vm/tailscale", () => {
  it("liefert 503 wenn K8s nicht erreichbar", async () => {
    getStatus.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it("liefert 503 wenn VM nicht Running", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "VM läuft nicht" });
  });

  it("liefert 503 wenn VM Running aber keine IP", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "VM läuft nicht" });
  });

  it("liefert tailscaleIp wenn SSH erfolgreich", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.42.0.198" });
    mockExec.mockResolvedValue("100.64.0.5\n");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tailscaleIp: "100.64.0.5" });
    expect(mockFromEnv).toHaveBeenCalledWith("10.42.0.198");
  });

  it("liefert 502 wenn SSH fehlschlägt", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.42.0.198" });
    mockExec.mockRejectedValue(new Error("Exit 1: tailscale not found"));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });
});
