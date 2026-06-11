import { Client, type ConnectConfig } from "ssh2";
import { readFileSync } from "fs";

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
    return new SshClient({ host, user, privateKey });
  }

  exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = "";
      let stderr = "";
      conn.on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) { conn.end(); return reject(err); }
          stream.on("data", (d: Buffer) => { stdout += d.toString(); });
          stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
          stream.on("close", (code: number) => {
            conn.end();
            if (code !== 0) reject(new Error(`Exit ${code}: ${stderr.trim()}`));
            else resolve(stdout);
          });
        });
      });
      conn.on("error", reject);
      conn.connect(this.connectConfig());
    });
  }

  stream(command: string): ReadableStream<Uint8Array> {
    const self = this;
    return new ReadableStream({
      start(controller) {
        const conn = new Client();
        conn.on("ready", () => {
          conn.exec(command, (err, stream) => {
            if (err) { controller.error(err); conn.end(); return; }
            stream.on("data", (d: Buffer) => controller.enqueue(d));
            stream.on("close", (code: number) => {
              conn.end();
              if (code !== 0) controller.error(new Error(`Stream exit ${code}`));
              else controller.close();
            });
            stream.on("error", (e: Error) => { controller.error(e); conn.end(); });
          });
        });
        conn.on("error", (e) => controller.error(e));
        conn.connect(self.connectConfig());
      },
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
      username: this.opts.user,
      privateKey: this.opts.privateKey,
      readyTimeout: 10000,
      hostHash: "sha256",
      hostVerifier: buildHostVerifier(),
    };
  }
}
