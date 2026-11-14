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

  it("räumt den Bestand weg, statt darüber zu entpacken: altes .pre-restore löschen, Saves dorthin verschieben", async () => {
    await call("backup-2026-01-01T00-00-00.tar.gz");
    const cmds = commands();
    const stop = cmds.findIndex((c) => c.includes("docker stop"));
    const move = cmds.findIndex((c) => c.includes("mv /opt/7dtd/data/Saves /opt/7dtd/data/Saves.pre-restore"));
    const tar = cmds.findIndex((c) => c.includes("tar xzf -"));
    expect(move).toBeGreaterThan(stop);
    expect(move).toBeLessThan(tar);
    // ein älteres .pre-restore wird vorher entfernt (sonst landete Saves DARIN)
    const rm = cmds[move].indexOf("rm -rf /opt/7dtd/data/Saves.pre-restore");
    expect(rm).toBeGreaterThanOrEqual(0);
    expect(rm).toBeLessThan(cmds[move].indexOf("mv /opt/7dtd/data/Saves "));
  });

  it("stellt den vorherigen Stand wieder her, wenn das Entpacken fehlschlägt", async () => {
    execMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes("tar xzf -")) throw new Error("Exit 2: tar: Unexpected EOF");
      return "";
    });
    const res = await call("backup-2026-01-01T00-00-00.tar.gz");
    expect(res.status).toBe(502);
    const cmds = commands();
    const rollback = cmds.findIndex((c) => c.includes("mv /opt/7dtd/data/Saves.pre-restore /opt/7dtd/data/Saves"));
    const start = cmds.findIndex((c) => c.includes("docker start"));
    expect(rollback).toBeGreaterThan(cmds.findIndex((c) => c.includes("tar xzf -")));
    expect(rollback).toBeLessThan(start);
  });

  it("rollt nichts zurück, wenn schon das Wegräumen scheitert (Saves liegt dann noch am Platz)", async () => {
    execMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes("Saves.pre-restore")) throw new Error("Exit 1: mv: cannot move");
      return "";
    });
    const res = await call("backup-2026-01-01T00-00-00.tar.gz");
    expect(res.status).toBe(502);
    const cmds = commands();
    expect(cmds.some((c) => c.includes("tar xzf -"))).toBe(false);
    expect(cmds.filter((c) => c.includes("Saves.pre-restore"))).toHaveLength(1);
    expect(cmds.some((c) => c.includes("docker start"))).toBe(true);
  });

  it("startet den Server auch dann wieder, wenn schon docker stop fehlschlägt", async () => {
    execMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes("docker stop")) throw new Error("SSH command timed out after 300000 ms");
      return "";
    });
    const res = await call("backup-2026-01-01T00-00-00.tar.gz");
    expect(res.status).toBe(502);
    const cmds = commands();
    expect(cmds.some((c) => c.includes("docker start"))).toBe(true);
    expect(cmds.some((c) => c.includes("Saves.pre-restore"))).toBe(false);
  });

  it("liefert 409, solange ein anderer Restore läuft", async () => {
    let finish!: () => void;
    execMock.mockImplementationOnce(() => new Promise<string>((r) => { finish = () => r(""); }));
    const first = call("backup-2026-01-01T00-00-00.tar.gz");
    await vi.waitFor(() => expect(execMock).toHaveBeenCalled());

    const second = await call("backup-2026-01-01T00-00-00.tar.gz");
    expect(second.status).toBe(409);
    expect(execMock).toHaveBeenCalledTimes(1);

    finish();
    expect((await first).status).toBe(200);
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
