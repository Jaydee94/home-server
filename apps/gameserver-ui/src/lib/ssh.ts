import { Client, type ConnectConfig } from "ssh2";
import { readFileSync } from "fs";

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

  private connectConfig(): ConnectConfig {
    return { host: this.opts.host, username: this.opts.user, privateKey: this.opts.privateKey, readyTimeout: 10000 };
  }
}
