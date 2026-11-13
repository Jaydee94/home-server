import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Readable } from "stream";
import type { AddressInfo } from "net";
import ssh2 from "ssh2";
import { SshClient } from "@/lib/ssh";

// Integrationstest gegen einen echten SSH-Server (ssh2.Server) auf localhost —
// prüft, was die Unit-Tests mit gemocktem ssh2 nicht zeigen können: dass ein
// abgebrochener Stream die Session auch SERVERSEITIG beendet, dass stdin samt EOF
// ankommt und dass ein SFTP-Upload als Stream funktioniert.
const { Server, utils } = ssh2;

const state = {
  openSessions: 0,
  followClosed: 0,
  files: new Map<string, Buffer>(),
};

let server: InstanceType<typeof Server>;
let port: number;
let clientKey: string;

const waitFor = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("waitFor: Bedingung nicht erfüllt");
    await new Promise((r) => setTimeout(r, 5));
  }
};

beforeAll(async () => {
  const hostKey = utils.generateKeyPairSync("ed25519");
  clientKey = utils.generateKeyPairSync("ed25519").private;

  server = new Server({ hostKeys: [hostKey.private] }, (client) => {
    state.openSessions++;
    client.on("authentication", (ctx) => ctx.accept());
    client.on("close", () => { state.openSessions--; });
    client.on("error", () => undefined);
    client.on("ready", () => {
      client.on("session", (acceptSession) => {
        const session = acceptSession();

        session.on("exec", (accept, _reject, info) => {
          const ch = accept();
          ch.on("error", () => undefined);
          if (info.command === "follow") {
            // wie `docker logs -f`: schreibt, bis die Gegenseite auflegt
            // (der Kanal meldet bei einem Verbindungsabriss kein eigenes "close")
            const timer = setInterval(() => ch.write("zeile\n"), 2);
            client.once("close", () => { clearInterval(timer); state.followClosed++; });
          } else if (info.command === "count-stdin") {
            let bytes = 0;
            ch.on("data", (d: Buffer) => { bytes += d.length; });
            ch.on("end", () => { ch.write(String(bytes)); ch.exit(0); ch.end(); });
          } else if (info.command === "fail") {
            ch.stderr.write("boom\n");
            ch.exit(3);
            ch.end();
          } else if (info.command === "hang") {
            /* antwortet nie */
          } else {
            ch.write(`ran: ${info.command}`);
            ch.exit(0);
            ch.end();
          }
        });

        session.on("sftp", (accept) => {
          const sftp = accept();
          const open = new Map<string, { path: string; parts: Buffer[] }>();
          let next = 0;
          const OK = utils.sftp.STATUS_CODE.OK;
          sftp.on("OPEN", (reqid, filename) => {
            const handle = Buffer.from(String(next++));
            open.set(handle.toString(), { path: filename, parts: [] });
            sftp.handle(reqid, handle);
          });
          sftp.on("WRITE", (reqid, handle, _offset, data) => {
            open.get(handle.toString())!.parts.push(Buffer.from(data));
            sftp.status(reqid, OK);
          });
          sftp.on("FSETSTAT", (reqid) => sftp.status(reqid, OK));
          sftp.on("CLOSE", (reqid, handle) => {
            const f = open.get(handle.toString())!;
            state.files.set(f.path, Buffer.concat(f.parts));
            sftp.status(reqid, OK);
          });
        });
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const client = () =>
  new SshClient({ host: "127.0.0.1", port, user: "ubuntu", privateKey: clientKey });

describe("SshClient gegen echten SSH-Server", () => {
  it("exec liefert stdout und baut die Verbindung wieder ab", async () => {
    await expect(client().exec("hallo")).resolves.toBe("ran: hallo");
    await waitFor(() => state.openSessions === 0);
  });

  it("exec meldet Exit-Code und stderr", async () => {
    await expect(client().exec("fail")).rejects.toThrow("Exit 3: boom");
    await waitFor(() => state.openSessions === 0);
  });

  it("exec bricht ein hängendes Kommando per Timeout ab und trennt die Verbindung", async () => {
    await expect(client().exec("hang", { timeoutMs: 150 })).rejects.toThrow(/timed out/);
    await waitFor(() => state.openSessions === 0);
  });

  it("exec streamt stdin (5 MB) in das Kommando und sendet EOF", async () => {
    const chunk = Buffer.alloc(64 * 1024, 7);
    const total = 80 * chunk.length;
    const stdin = Readable.from((function* () { for (let i = 0; i < 80; i++) yield chunk; })());
    await expect(client().exec("count-stdin", { stdin, timeoutMs: 0 })).resolves.toBe(String(total));
    await waitFor(() => state.openSessions === 0);
  });

  it("stream: Abbruch durch den Konsumenten beendet die Session auf dem Server", async () => {
    const before = state.followClosed;
    const reader = client().stream("follow").getReader();
    const first = await reader.read();
    expect(Buffer.from(first.value!).toString()).toContain("zeile");
    expect(state.openSessions).toBe(1);

    await reader.cancel();
    await waitFor(() => state.followClosed === before + 1);
    await waitFor(() => state.openSessions === 0);
  });

  it("stream: ohne Leser wird die Ausgabe nicht unbegrenzt gepuffert (Backpressure)", async () => {
    const stream = client().stream("follow");
    const reader = stream.getReader();
    await reader.read();
    // 150 ms lang nicht lesen: der Server schreibt weiter, der Client pausiert.
    await new Promise((r) => setTimeout(r, 150));
    await reader.cancel();
    await waitFor(() => state.openSessions === 0);
  });

  it("sftpPut lädt einen Stream hoch", async () => {
    const chunk = Buffer.alloc(32 * 1024, 1);
    const data = Readable.from((function* () { for (let i = 0; i < 40; i++) yield chunk; })());
    await client().sftpPut(data, "/tmp/mod_upload_test.zip");
    expect(state.files.get("/tmp/mod_upload_test.zip")?.length).toBe(40 * chunk.length);
    await waitFor(() => state.openSessions === 0);
  });

  it("sftpPut lädt weiterhin einen Buffer hoch", async () => {
    await client().sftpPut(Buffer.from("inhalt"), "/tmp/buffer.bin");
    expect(state.files.get("/tmp/buffer.bin")?.toString()).toBe("inhalt");
  });

  it("sftpPut meldet einen Fehler der Quelle (z. B. Upload-Limit) und trennt die Verbindung", async () => {
    const data = new Readable({ read() { this.destroy(new Error("zu groß")); } });
    await expect(client().sftpPut(data, "/tmp/abgebrochen.zip")).rejects.toThrow("zu groß");
    await waitFor(() => state.openSessions === 0);
  });
});
