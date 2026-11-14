import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
const restartServer = vi.fn();
vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/ssh", () => ({ SshClient: { fromEnv: () => ({}) } }));
vi.mock("@/lib/restart", () => ({ restartServer: (...a: unknown[]) => restartServer(...a) }));

import { POST } from "@/app/api/restart/route";

beforeEach(() => {
  vi.clearAllMocks();
  getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
  restartServer.mockResolvedValue(undefined);
});

describe("POST /api/restart", () => {
  it("startet über restartServer neu", async () => {
    expect((await POST()).status).toBe(200);
    expect(restartServer).toHaveBeenCalledTimes(1);
  });

  it("liefert 409, solange eine andere Server-Operation läuft", async () => {
    let finish!: () => void;
    restartServer.mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
    const first = POST();
    await vi.waitFor(() => expect(restartServer).toHaveBeenCalled());

    expect((await POST()).status).toBe(409);
    expect(restartServer).toHaveBeenCalledTimes(1);

    finish();
    expect((await first).status).toBe(200);
  });
});
