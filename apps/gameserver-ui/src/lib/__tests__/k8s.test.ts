import { describe, it, expect, vi } from "vitest";
import { VmClient } from "@/lib/k8s";

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    getNamespacedCustomObject: vi.fn(),
    patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("VmClient.getStatus", () => {
  it("liefert runStrategy, printableStatus und VMI-Phase wenn die VM läuft", async () => {
    const api = fakeApi({
      getNamespacedCustomObject: vi
        .fn()
        .mockResolvedValueOnce({
          spec: { runStrategy: "Always" },
          status: { printableStatus: "Running" },
        })
        .mockResolvedValueOnce({
          status: {
            phase: "Running",
            interfaces: [{ ipAddress: "10.42.0.99" }],
            phaseTransitionTimestamps: [
              { phase: "Running", phaseTransitionTimestamp: "2026-06-10T18:00:00Z" },
            ],
          },
        }),
    });
    const c = new VmClient(api as never);
    const s = await c.getStatus();
    expect(s).toEqual({
      runStrategy: "Always",
      printableStatus: "Running",
      vmiPhase: "Running",
      ipAddress: "10.42.0.99",
      runningSince: "2026-06-10T18:00:00Z",
    });
  });

  it("liefert vmiPhase=null wenn keine VMI existiert (404)", async () => {
    const api = fakeApi({
      getNamespacedCustomObject: vi
        .fn()
        .mockResolvedValueOnce({
          spec: { runStrategy: "Halted" },
          status: { printableStatus: "Stopped" },
        })
        .mockRejectedValueOnce(Object.assign(new Error("not found"), { code: 404 })),
    });
    const c = new VmClient(api as never);
    const s = await c.getStatus();
    expect(s.vmiPhase).toBeNull();
    expect(s.runStrategy).toBe("Halted");
  });

  it("reicht Nicht-404-Fehler durch", async () => {
    const api = fakeApi({
      getNamespacedCustomObject: vi
        .fn()
        .mockResolvedValueOnce({ spec: {}, status: {} })
        .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { code: 403 })),
    });
    const c = new VmClient(api as never);
    await expect(c.getStatus()).rejects.toThrow("forbidden");
  });
});

describe("VmClient.setRunStrategy", () => {
  it("patcht die VM mit merge-patch", async () => {
    const api = fakeApi();
    const c = new VmClient(api as never);
    await c.setRunStrategy("Always");
    expect(api.patchNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({
        group: "kubevirt.io",
        version: "v1",
        namespace: "gameserver",
        plural: "virtualmachines",
        name: "7dtd-server",
        body: { spec: { runStrategy: "Always" } },
      }),
      // setHeaderOptions(Content-Type: merge-patch) — CRDs unterstützen kein strategic merge
      expect.anything()
    );
  });
});
