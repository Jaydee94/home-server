import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import { readFileSync } from "fs";
import type { Readable } from "stream";

function buildHostVerifier(): ConnectConfig["hostVerifier"] {
  const pinned = process.env.VM_SSH_HOST_FINGERPRINT;
  return (keyHash: Buffer | string) => {
    const hex = Buffer.isBuffer(keyHash) ? keyHash.toString("hex") : keyHash;
    if (!pinned) {
      console.warn("[ssh] VM_SSH_HOST_FINGERPRINT not set — host key not verified");
      return true;
    }
    const match = hex === pinned;
    if (!match) console.error(`[ssh] Host key mismatch: got ${hex}, expected ${pinned}`);
    return match;
  };
}

export interface SshOptions {
  host: string;
  user: string;
  privateKey: string;
  /** Standard: 22. Über VM_SSH_PORT überschreibbar (lokale Tests gegen einen Fake-Server). */
  port?: number;
}

// Obergrenze für ein einzelnes Kommando (Verbindungsaufbau + Ausführung). Ohne sie
// hängt ein Request ewig, wenn die VM zwar SSH annimmt, das Kommando aber nicht
// zurückkommt. Lang laufende Operationen (docker stop/restart, unzip, Restore)
// setzen `timeoutMs` bewusst höher bzw. auf 0 (= kein Timeout).
export const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

// Für docker stop/start/restart und Entpacken: dauert regulär länger als 30 s,
// soll aber trotzdem nicht ewig hängen.
export const LONG_EXEC_TIMEOUT_MS = 5 * 60_000;

export interface ExecOptions {
  /** Timeout in ms für Verbindungsaufbau + Kommando; 0 = kein Timeout. */
  timeoutMs?: number;
  /** Wird in den stdin des Kommandos gepiped (danach EOF). */
  stdin?: Readable;
}

export class SshClient {
  constructor(private opts: SshOptions) {}

  static fromEnv(host: string): SshClient {
    const keyPath = process.env.VM_SSH_KEY_PATH ?? "/etc/gameserver-ui/ssh/privateKey";
    const user = process.env.VM_SSH_USER ?? "ubuntu";
    let privateKey: string;
    try {
      privateKey = readFileSync(keyPath, "utf8");
    } catch {
      throw new Error(`SSH key not found at ${keyPath} — set VM_SSH_KEY_PATH`);
    }
    const port = process.env.VM_SSH_PORT ? Number(process.env.VM_SSH_PORT) : undefined;
    return new SshClient({ host, user, privateKey, port });
  }

  exec(command: string, options: ExecOptions = {}): Promise<string> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      // Genau einmal abschließen: Timer stoppen und die Verbindung schließen —
      // hart (inkl. stdin-Quelle) bei Fehler/Timeout, sonst sauber.
      const settle = (err: Error | null, value = "") => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (err) {
          options.stdin?.destroy();
          conn.destroy();
          reject(err);
        } else {
          conn.end();
          resolve(value);
        }
      };

      if (timeoutMs > 0) {
        timer = setTimeout(
          () => settle(new Error(`SSH command timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
      }
      // Fehler der Quelle auch dann melden, wenn die Verbindung noch nicht steht.
      options.stdin?.on("error", (e: Error) => settle(e));

      conn.on("ready", () => {
        if (settled) return;
        conn.exec(command, (err, stream) => {
          if (err) return settle(err);
          stream.on("data", (d: Buffer) => { stdout += d.toString(); });
          stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
          stream.on("close", (code: number) => {
            if (code !== 0) settle(new Error(`Exit ${code}: ${stderr.trim()}`));
            else settle(null, stdout);
          });
          if (options.stdin) {
            // Beendet sich das Kommando, bevor stdin leer ist (z. B. tar-Fehler),
            // meldet der Kanal einen Schreibfehler — maßgeblich ist der Exit-Code
            // aus "close".
            stream.on("error", () => undefined);
            options.stdin.pipe(stream);
          }
        });
      });
      conn.on("error", (e: Error) => settle(e));
      conn.connect(this.connectConfig());
    });
  }

  // Liefert stdout des Kommandos als Web-Stream. Bricht der Konsument ab
  // (`cancel()`, z. B. weil der Browser die Logs-Seite verlässt), wird die
  // SSH-Verbindung geschlossen — sonst bliebe pro Aufruf eine Session samt
  // `docker logs -f` offen. Liest der Konsument nicht, pausiert der SSH-Kanal,
  // statt die Ausgabe unbegrenzt im Speicher zu puffern.
  stream(command: string): ReadableStream<Uint8Array> {
    const config = this.connectConfig();
    const conn = new Client();
    let channel: ClientChannel | undefined;
    let finished = false;

    // Beendet den Stream genau einmal und baut die Verbindung ab.
    const finish = (settleController?: () => void) => {
      if (finished) return;
      finished = true;
      try {
        settleController?.();
      } catch {
        /* Controller bereits geschlossen */
      }
      conn.end();
    };

    return new ReadableStream<Uint8Array>({
      start(controller) {
        conn.on("ready", () => {
          // Schon vor dem Verbindungsaufbau abgebrochen → gar nicht erst starten.
          if (finished) { conn.destroy(); return; }
          conn.exec(command, (err, stream) => {
            if (err) return finish(() => controller.error(err));
            if (finished) { conn.destroy(); return; }
            channel = stream;
            stream.on("data", (d: Buffer) => {
              if (finished) return;
              controller.enqueue(d);
              if ((controller.desiredSize ?? 0) <= 0) stream.pause();
            });
            // stderr wird nicht ausgewertet, muss aber abfließen — sonst kann ein
            // volles Kanal-Fenster das Kommando blockieren.
            stream.stderr.resume();
            stream.on("close", (code: number) => {
              finish(() => {
                if (code !== 0) controller.error(new Error(`Stream exit ${code}`));
                else controller.close();
              });
            });
            stream.on("error", (e: Error) => finish(() => controller.error(e)));
          });
        });
        conn.on("error", (e: Error) => finish(() => controller.error(e)));
        conn.connect(config);
      },
      pull() {
        channel?.resume();
      },
      cancel() {
        // Hart trennen: beim Abbruch gibt es nichts mehr sauber zu Ende zu lesen,
        // und der Abbau soll nicht von der Gegenseite abhängen.
        if (finished) return;
        finished = true;
        channel?.destroy();
        conn.destroy();
      },
    });
  }

  sftpPut(data: Buffer | Readable, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const fail = (e: Error) => {
        if (!Buffer.isBuffer(data)) data.destroy();
        conn.end();
        reject(e);
      };
      // Fehler der Quelle auch dann melden, wenn die Verbindung noch nicht steht.
      if (!Buffer.isBuffer(data)) data.on("error", fail);
      conn.on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) return fail(err);
          const ws = sftp.createWriteStream(remotePath);
          ws.on("error", fail);
          ws.on("close", () => { conn.end(); resolve(); });
          // Streams werden durchgereicht, statt die Datei im RAM zu halten.
          if (Buffer.isBuffer(data)) ws.end(data);
          else data.pipe(ws);
        });
      });
      conn.on("error", fail);
      conn.connect(this.connectConfig());
    });
  }

  forwardOut(dstPort: number) {
    return new Promise<{ channel: import("stream").Duplex; close: () => void }>((resolve, reject) => {
      const conn = new Client();
      conn.on("ready", () => {
        conn.forwardOut("127.0.0.1", 0, "127.0.0.1", dstPort, (err, channel) => {
          if (err) { conn.end(); return reject(err); }
          resolve({ channel, close: () => conn.end() });
        });
      });
      conn.on("error", reject);
      conn.connect(this.connectConfig());
    });
  }

  private connectConfig(): ConnectConfig {
    return {
      host: this.opts.host,
      port: this.opts.port,
      username: this.opts.user,
      privateKey: this.opts.privateKey,
      readyTimeout: 10000,
      hostHash: "sha256",
      hostVerifier: buildHostVerifier(),
    };
  }
}
