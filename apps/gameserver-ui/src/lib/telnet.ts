import * as net from "net";

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
  host: string;
  port: number;
  password: string;
  timeoutMs?: number;
}

export async function telnetCommand(opts: TelnetOptions, command: string): Promise<string> {
  const { host, port, password, timeoutMs = 10000 } = opts;
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let buf = "";
    let authed = false;
    const timer = setTimeout(() => { sock.destroy(); reject(new Error("Telnet timeout")); }, timeoutMs);

    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      if (!authed && buf.includes("Please enter password:")) {
        sock.write(password + "\r\n");
        buf = "";
        return;
      }
      if (!authed && (buf.includes("Logon successful") || buf.includes("Press 'help'"))) {
        authed = true;
        buf = "";
        sock.write(command + "\r\n");
        return;
      }
      if (authed && buf.includes("\n")) {
        clearTimeout(timer);
        setTimeout(() => { sock.destroy(); resolve(buf.trim()); }, 300);
      }
    });
    sock.on("error", (e) => { clearTimeout(timer); reject(e); });
    sock.on("close", () => clearTimeout(timer));
  });
}

export function telnetOptsFromEnv(host: string): TelnetOptions {
  return {
    host,
    port: Number(process.env.VM_TELNET_PORT ?? "8081"),
    password: process.env.TELNET_PASSWORD ?? "",
  };
}
