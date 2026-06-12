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

// 7DTD-Server-Logzeilen beginnen mit einem ISO-Zeitstempel (z. B.
// "2026-06-12T07:36:07 476.342 INF …"). Echte Befehlsausgaben (Spielerliste,
// "Day 2, 05:53", Config-Werte …) tun das nie. Da der Server sein Log an alle
// Telnet-Clients broadcastet — inkl. der jüngsten History an neu verbundene
// Clients — landet sonst Verbindungs-/Fehler-Rauschen in der Ausgabe.
const SERVER_LOG_LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s/;

export function stripServerLog(output: string): string {
  return output
    .split("\n")
    .filter((line) => !SERVER_LOG_LINE.test(line))
    .join("\n")
    .trim();
}

export async function telnetCommand(ssh: SshClient, opts: TelnetOptions, command: string): Promise<string> {
  const { port, password, timeoutMs = 10000 } = opts;
  const { channel, close } = await ssh.forwardOut(port);
  return new Promise((resolve, reject) => {
    let buf = "";
    let authed = false;
    let result: string | null = null;
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(exitTimer);
      close();
      fn();
    };
    const timer = setTimeout(() => {
      channel.destroy();
      settle(() => (result !== null ? resolve(result) : reject(new Error("Telnet timeout"))));
    }, timeoutMs);
    let exitTimer: ReturnType<typeof setTimeout>;

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
      if (authed && result === null && buf.includes("\n")) {
        // Kurz auf den vollständigen Output warten, dann per 7DTD-`exit` sauber
        // abmelden: der Server schließt den Socket selbst und sein Writer-Thread
        // endet ohne den "socket has been shut down"-IOException, den ein abruptes
        // channel.destroy() auslöst.
        setTimeout(() => {
          if (result !== null) return;
          result = stripServerLog(buf);
          channel.end("exit\r\n");
          // Fallback, falls der Server nach `exit` nicht zeitnah schließt.
          exitTimer = setTimeout(() => { channel.destroy(); settle(() => resolve(result as string)); }, 1500);
        }, 300);
      }
    });
    channel.on("error", (e) => settle(() => reject(e)));
    channel.on("close", () =>
      settle(() => (result !== null ? resolve(result) : reject(new Error("Telnet closed before response")))),
    );
  });
}

export function telnetOptsFromEnv(): TelnetOptions {
  return {
    port: Number(process.env.VM_TELNET_PORT ?? "8081"),
    password: process.env.TELNET_PASSWORD ?? "",
  };
}
