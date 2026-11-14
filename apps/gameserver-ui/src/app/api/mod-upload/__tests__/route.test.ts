import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

const getStatus = vi.fn();
const execMock = vi.fn();
const sftpPut = vi.fn();
vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/ssh", () => ({
  SshClient: { fromEnv: () => ({ exec: execMock, sftpPut }) },
  LONG_EXEC_TIMEOUT_MS: 300000,
}));

// Die Route ist von der Middleware ausgenommen (sonst puffert Next.js den Body im
// RAM) und muss die Session deshalb selbst prüfen.
const requireSession = vi.fn();
vi.mock("@/lib/session", () => ({ requireSession: () => requireSession() }));

import { POST } from "@/app/api/mod-upload/route";
import { MAX_MOD_UPLOAD_BYTES } from "@/lib/mods";

const upload = (
  filename: string | null,
  body: BodyInit | null,
  headers: Record<string, string> = {},
) => {
  const query = filename === null ? "" : `?filename=${encodeURIComponent(filename)}`;
  const init = { method: "POST", body, headers, duplex: "half" };
  return POST(new Request(`http://x/api/mod-upload${query}`, init as RequestInit));
};
const commands = () => execMock.mock.calls.map((c) => c[0] as string);

// Liest den durchgereichten Stream leer — wie es der SFTP-Upload tut.
let received: Buffer;
beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(null);
  received = Buffer.alloc(0);
  getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
  execMock.mockResolvedValue("");
  sftpPut.mockImplementation(async (data: Readable) => {
    const parts: Buffer[] = [];
    for await (const chunk of data) parts.push(Buffer.from(chunk));
    received = Buffer.concat(parts);
  });
});

describe("POST /api/mod-upload", () => {
  it("lehnt ohne gültige Session mit 401 ab, bevor irgendetwas passiert", async () => {
    requireSession.mockResolvedValue(Response.json({ error: "Nicht angemeldet" }, { status: 401 }));
    const res = await upload("MeinMod.zip", "PK");
    expect(res.status).toBe(401);
    expect(getStatus).not.toHaveBeenCalled();
    expect(sftpPut).not.toHaveBeenCalled();
    expect(execMock).not.toHaveBeenCalled();
  });

  it("reicht den Request-Body als Stream an SFTP durch (kein Buffer im RAM)", async () => {
    const res = await upload("MeinMod.zip", "PK-zipdaten");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: "MeinMod" });

    const [data] = sftpPut.mock.calls[0];
    expect(Buffer.isBuffer(data)).toBe(false);
    expect(data).toBeInstanceOf(Readable);
    expect(received.toString()).toBe("PK-zipdaten");
  });

  it("nutzt pro Upload einen eindeutigen Pfad (parallele Uploads überschreiben sich nicht)", async () => {
    await Promise.all([upload("A.zip", "a"), upload("B.zip", "b")]);
    const paths = sftpPut.mock.calls.map((c) => c[1] as string);
    expect(paths).toHaveLength(2);
    for (const p of paths) expect(p).toMatch(/^\/tmp\/mod_upload_[0-9a-f-]{36}\.zip$/);
    expect(paths[0]).not.toBe(paths[1]);
  });

  it("prüft das Archiv auf Zip-Slip, BEVOR entpackt wird, und räumt danach auf", async () => {
    await upload("MeinMod.zip", "PK");
    const path = sftpPut.mock.calls[0][1] as string;
    const cmds = commands();
    const check = cmds.findIndex((c) => c.includes("zipfile") && c.includes(path));
    const unzip = cmds.findIndex((c) => c.includes("unzip") && c.includes(path));
    const cleanup = cmds.findIndex((c) => c.startsWith("rm -f") && c.includes(path));
    expect(check).toBeGreaterThanOrEqual(0);
    expect(cmds[check]).toContain("n.startswith('/') or '..' in n.split('/')");
    expect(check).toBeLessThan(unzip);
    expect(unzip).toBeLessThan(cleanup);
  });

  it("entpackt nicht, wenn die Zip-Slip-Prüfung fehlschlägt, räumt aber auf", async () => {
    execMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes("zipfile")) throw new Error("Exit 1: ");
      return "";
    });
    const res = await upload("Boese.zip", "PK");
    expect(res.status).toBe(502);
    expect(commands().some((c) => c.includes("unzip"))).toBe(false);
    expect(commands().some((c) => c.startsWith("rm -f"))).toBe(true);
  });

  it("lehnt Dateien ab, die nicht auf .zip enden", async () => {
    const res = await upload("mod.exe", "x");
    expect(res.status).toBe(400);
    expect(sftpPut).not.toHaveBeenCalled();
  });

  it("verlangt einen Dateinamen", async () => {
    const res = await upload(null, "x");
    expect(res.status).toBe(400);
    expect(sftpPut).not.toHaveBeenCalled();
  });

  it("verlangt einen Body", async () => {
    const res = await upload("MeinMod.zip", null);
    expect(res.status).toBe(400);
    expect(sftpPut).not.toHaveBeenCalled();
  });

  it("lehnt zu große Uploads anhand von Content-Length ab, ohne etwas zu übertragen", async () => {
    const res = await upload("Riesig.zip", "x", {
      "Content-Length": String(MAX_MOD_UPLOAD_BYTES + 1),
    });
    expect(res.status).toBe(413);
    expect(sftpPut).not.toHaveBeenCalled();
  });

  it("bricht ab, wenn der Body ohne Content-Length das Limit überschreitet", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_MOD_UPLOAD_BYTES + chunk.length) return controller.close();
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    sftpPut.mockImplementation(async (data: Readable) => {
      for await (const c of data) void c;
    });
    const res = await upload("Riesig.zip", body);
    expect(res.status).toBe(413);
    expect(commands().some((c) => c.includes("unzip"))).toBe(false);
    expect(commands().some((c) => c.startsWith("rm -f"))).toBe(true);
  });

  it("liefert 503, wenn die VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    expect((await upload("MeinMod.zip", "PK")).status).toBe(503);
    expect(sftpPut).not.toHaveBeenCalled();
  });
});

describe("Upload-Limit", () => {
  it("liegt bei 100 MB", () => {
    expect(MAX_MOD_UPLOAD_BYTES).toBe(100 * 1024 * 1024);
  });
});
