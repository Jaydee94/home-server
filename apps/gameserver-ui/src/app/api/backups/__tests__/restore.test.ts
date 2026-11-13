import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
const execMock = vi.fn();
vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/ssh", () => ({
  SshClient: { fromEnv: () => ({ exec: execMock }) },
  LONG_EXEC_TIMEOUT_MS: 300000,
}));

// Das Archiv darf nicht mehr per readFileSync in den RAM geladen werden; die Route
// reicht stattdessen einen ReadStream an das SSH-Kommando durch.
const fakeFileStream = { fake: "read-stream" };
const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  createReadStream: vi.fn(),
  readFileSync: vi.fn(),
}));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, ...fsMock };
});

import { POST } from "@/app/api/backups/[name]/restore/route";

const call = (name: string) =>
  POST(new Request("http://x/api/backups/x/restore", { method: "POST" }), {
    params: Promise.resolve({ name }),
  });
const commands = () => execMock.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.existsSync.mockReturnValue(true);
  fsMock.createReadStream.mockReturnValue(fakeFileStream);
  fsMock.readFileSync.mockImplementation(() => {
    throw new Error("readFileSync darf nicht benutzt werden");
  });
  getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
  execMock.mockResolvedValue("");
});

describe("/api/backups/[name]/restore", () => {
  it("streamt das Archiv in den stdin EINES tar-Kommandos statt es zu puffern", async () => {
    const res = await call("backup-2026-01-01T00-00-00.tar.gz");
    expect(res.status).toBe(200);

    const tarCalls = execMock.mock.calls.filter((c) => (c[0] as string).includes("tar xzf -"));
    expect(tarCalls).toHaveLength(1);
    expect(tarCalls[0][1].stdin).toBe(fakeFileStream);
    // Der Transfer läuft ohne Kommando-Timeout (große Welten brauchen länger).
    expect(tarCalls[0][1].timeoutMs).toBe(0);
    expect(fsMock.createReadStream).toHaveBeenCalledWith(
      expect.stringMatching(/\/backups\/backup-2026-01-01T00-00-00\.tar\.gz$/),
    );
    expect(fsMock.readFileSync).not.toHaveBeenCalled();
    // Kein base64-Chunking mit einer SSH-Verbindung pro 64-KB-Stück mehr.
    expect(commands().some((c) => c.includes("printf") || c.includes("base64"))).toBe(false);
  });

  it("stoppt den Server vor dem Entpacken und startet ihn danach wieder", async () => {
    await call("backup-2026-01-01T00-00-00.tar.gz");
    const cmds = commands();
    const stop = cmds.findIndex((c) => c.includes("docker stop"));
    const tar = cmds.findIndex((c) => c.includes("tar xzf -"));
    const start = cmds.findIndex((c) => c.includes("docker start"));
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(stop).toBeLessThan(tar);
    expect(tar).toBeLessThan(start);
  });

  it("startet den Server auch dann wieder, wenn das Entpacken fehlschlägt", async () => {
    execMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes("tar xzf -")) throw new Error("Exit 2: tar: Unexpected EOF");
      return "";
    });
    const res = await call("backup-2026-01-01T00-00-00.tar.gz");
    expect(res.status).toBe(502);
    expect(commands().some((c) => c.includes("docker start"))).toBe(true);
  });

  it("liefert 404 für ein unbekanntes Backup, ohne den Server anzufassen", async () => {
    fsMock.existsSync.mockReturnValue(false);
    const res = await call("gibt-es-nicht.tar.gz");
    expect(res.status).toBe(404);
    expect(execMock).not.toHaveBeenCalled();
  });

  it("lehnt Path-Traversal ab, ohne den Server anzufassen", async () => {
    const res = await call("../../etc/passwd");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Ungültiger Dateiname");
    expect(execMock).not.toHaveBeenCalled();
    expect(fsMock.createReadStream).not.toHaveBeenCalled();
  });

  it("liefert 503, wenn die VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    expect((await call("backup-2026-01-01T00-00-00.tar.gz")).status).toBe(503);
    expect(execMock).not.toHaveBeenCalled();
  });
});
