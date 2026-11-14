import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
const execMock = vi.fn();
const restartServer = vi.fn();

vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/ssh", () => ({
  SshClient: { fromEnv: () => ({ exec: execMock }) },
  LONG_EXEC_TIMEOUT_MS: 300000,
}));
vi.mock("@/lib/restart", () => ({ restartServer: (...a: unknown[]) => restartServer(...a) }));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(false), writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

import { GET, PUT } from "@/app/api/config/route";

const VALID = '<ServerSettings><property name="ServerName" value="Neu"/></ServerSettings>';
const put = (body: unknown) =>
  PUT(new Request("http://x/api/config", { method: "PUT", body: JSON.stringify(body) }));
const commands = () => execMock.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
  execMock.mockResolvedValue("");
  restartServer.mockResolvedValue(undefined);
});

describe("/api/config", () => {
  it("GET liest serverconfig.xml per SSH", async () => {
    execMock.mockResolvedValue('<ServerSettings><property name="ServerName" value="Test"/></ServerSettings>');
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).xml).toContain("ServerName");
  });

  it("GET gibt 503 wenn VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("PUT sichert die alte Config nach .bak, BEVOR die neue geschrieben wird", async () => {
    const res = await put({ xml: VALID });
    expect(res.status).toBe(200);
    const cmds = commands();
    const bak = cmds.findIndex((c) => /cp .*serverconfig\.xml .*serverconfig\.xml\.bak/.test(c));
    const write = cmds.findIndex((c) => c.includes("tee /opt/7dtd/config/serverconfig.xml"));
    expect(bak).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(bak);
  });

  it("PUT schreibt nichts, wenn die Sicherung fehlschlägt", async () => {
    execMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes(".bak")) throw new Error("Exit 1: cp: Permission denied");
      return "";
    });
    const res = await put({ xml: VALID });
    expect(res.status).toBe(502);
    expect(commands().some((c) => c.includes("tee "))).toBe(false);
    expect(restartServer).not.toHaveBeenCalled();
  });

  it("PUT startet über den sauberen Ablauf (restartServer) neu statt per direktem docker restart", async () => {
    const order: string[] = [];
    execMock.mockImplementation(async (cmd: string) => { order.push(cmd.includes("tee ") ? "write" : "exec"); return ""; });
    restartServer.mockImplementation(async () => { order.push("restart"); });
    const res = await put({ xml: VALID });
    expect(res.status).toBe(200);
    expect(restartServer).toHaveBeenCalledTimes(1);
    // Ein nicht erreichbarer Telnet-Port (Server down wegen kaputter Config) darf
    // den Neustart nicht verhindern.
    expect(restartServer.mock.calls[0][2]).toEqual(expect.objectContaining({ tolerateTelnetFailure: true }));
    expect(order.indexOf("write")).toBeLessThan(order.indexOf("restart"));
    expect(commands().some((c) => c.includes("docker restart"))).toBe(false);
  });

  it("PUT lehnt nicht wohlgeformtes XML mit 400 ab und fasst die VM nicht an", async () => {
    const broken = '<ServerSettings><property name="ServerPassword" value="pa<property name="ServerPassword" value="ss"x"/></ServerSettings>';
    const res = await put({ xml: broken });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/wohlgeformt/);
    expect(execMock).not.toHaveBeenCalled();
    expect(restartServer).not.toHaveBeenCalled();
  });

  it("PUT liefert 409, solange ein anderer Config-Rollout läuft", async () => {
    let finish!: () => void;
    restartServer.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    const first = put({ xml: VALID });
    await vi.waitFor(() => expect(restartServer).toHaveBeenCalled());

    const second = await put({ xml: VALID });
    expect(second.status).toBe(409);
    expect(restartServer).toHaveBeenCalledTimes(1);

    finish();
    expect((await first).status).toBe(200);
  });

  it("PUT ohne xml gibt 400", async () => {
    const res = await put({});
    expect(res.status).toBe(400);
  });
});
