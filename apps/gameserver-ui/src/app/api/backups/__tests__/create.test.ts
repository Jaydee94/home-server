import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const getStatus = vi.fn();
const streamMock = vi.fn();
const telnetCommand = vi.fn();
vi.mock("@/lib/session", () => ({ requireSession: async () => null }));
vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/ssh", () => ({ SshClient: { fromEnv: () => ({ stream: streamMock }) } }));
vi.mock("@/lib/telnet", () => ({
  telnetCommand: (...a: unknown[]) => telnetCommand(...a),
  telnetOptsFromEnv: () => ({ port: 8081, password: "x" }),
}));

import { POST } from "@/app/api/backups/route";

const nas = mkdtempSync(join(tmpdir(), "gsui-backup-"));
process.env.NAS_MOUNT_PATH = nas;
afterAll(() => rmSync(nas, { recursive: true, force: true }));

const streamOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); },
  });

beforeEach(() => {
  vi.clearAllMocks();
  getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
  telnetCommand.mockResolvedValue("");
  streamMock.mockImplementation(() => streamOf("archiv"));
});

describe("POST /api/backups", () => {
  it("toleriert 'file changed as we read it' (tar-Exit 1) auf dem laufenden Server", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await POST();
    expect(res.status).toBe(200);

    const [command, options] = streamMock.mock.calls[0];
    expect(command).toContain("tar czf - --warning=no-file-changed");
    // stderr wird nicht mehr verworfen, sondern geloggt
    expect(command).not.toContain("2>/dev/null");
    expect(options.allowedExitCodes).toEqual([0, 1]);
    options.onStderr("tar: Removing leading `/' from member names");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[backup]"), expect.stringContaining("Removing leading"));
    warn.mockRestore();

    const { filename } = await res.json();
    expect(readFileSync(join(nas, "backups", filename), "utf8")).toBe("archiv");
  });

  it("verwirft das Teil-Archiv, wenn tar wirklich fehlschlägt", async () => {
    streamMock.mockImplementation(
      () => new ReadableStream<Uint8Array>({ start(c) { c.error(new Error("Stream exit 2")); } }),
    );
    const before = readdirSync(join(nas, "backups")).length;
    const res = await POST();
    expect(res.status).toBe(502);
    expect(readdirSync(join(nas, "backups"))).toHaveLength(before);
  });

  it("liefert 409, solange ein anderes Backup läuft", async () => {
    let finish!: () => void;
    telnetCommand.mockImplementationOnce(() => new Promise<string>((r) => { finish = () => r(""); }));
    const first = POST();
    await vi.waitFor(() => expect(telnetCommand).toHaveBeenCalled());

    const second = await POST();
    expect(second.status).toBe(409);
    expect(telnetCommand).toHaveBeenCalledTimes(1);
    expect(streamMock).not.toHaveBeenCalled();

    finish();
    expect((await first).status).toBe(200);
  });
});
