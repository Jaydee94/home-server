import type { SshClient } from "@/lib/ssh";

export interface Player {
  name: string;
  id: string;
  health: number;
  level: number;
  ping: number;
}

export function parseLp(output: string): Player[] {
  const players: Player[] = [];
  const lineRe = /^Player "(.+?)", id=(\d+),.+?health=(\d+),.+?level=(\d+),.+?ping=(\d+)/;
  for (const line of output.split("\n")) {
    const m = line.match(lineRe);
    if (m) {
      players.push({
        name: m[1],
        id: m[2],
        health: Number(m[3]),
        level: Number(m[4]),
        ping: Number(m[5]),
      });
    }
  }
  return players;
}

export interface TelnetOptions {
  port: number;
  password: string;
  timeoutMs?: number;
}

export async function telnetCommand(ssh: SshClient, opts: TelnetOptions, command: string): Promise<string> {
  const { port, password, timeoutMs = 10000 } = opts;
  const { channel, close } = await ssh.forwardOut(port);
  return new Promise((resolve, reject) => {
    let buf = "";
    let authed = false;
    const done = (fn: () => void) => { clearTimeout(timer); channel.destroy(); close(); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error("Telnet timeout"))), timeoutMs);

    channel.setEncoding("utf8");
    channel.on("data", (chunk: string) => {
      buf += chunk;
      if (!authed && buf.includes("Please enter password:")) {
        channel.write(password + "\r\n");
        buf = "";
        return;
      }
      if (!authed && (buf.includes("Logon successful") || buf.includes("Press 'help'"))) {
        authed = true;
        buf = "";
        channel.write(command + "\r\n");
        return;
      }
      if (authed && buf.includes("\n")) {
        setTimeout(() => done(() => resolve(buf.trim())), 300);
      }
    });
    channel.on("error", (e) => done(() => reject(e)));
    channel.on("close", () => { clearTimeout(timer); close(); });
  });
}

export function telnetOptsFromEnv(): TelnetOptions {
  return {
    port: Number(process.env.VM_TELNET_PORT ?? "8081"),
    password: process.env.TELNET_PASSWORD ?? "",
  };
}
