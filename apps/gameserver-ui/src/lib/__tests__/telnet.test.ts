import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { parseLp, stripServerLog, telnetCommand } from "@/lib/telnet";
import type { SshClient } from "@/lib/ssh";

describe("parseLp", () => {
  it("parst Spielerliste aus lp-Ausgabe", () => {
    const output = `Total of 2 in the game\nPlayer "Hans", id=76561198000000001, pos=(100, 64, 200), health=100, deaths=0, zombies=5, players=0, score=0, level=1, steamid=76561198000000001, ip=127.0.0.1, ping=0\nPlayer "Greta", id=76561198000000002, pos=(50, 64, 100), health=80, deaths=1, zombies=10, players=0, score=50, level=3, steamid=76561198000000002, ip=127.0.0.2, ping=5`;
    const players = parseLp(output);
    expect(players).toHaveLength(2);
    expect(players[0]).toEqual({ name: "Hans", id: "76561198000000001", health: 100, level: 1, ping: 0 });
    expect(players[1]).toEqual({ name: "Greta", id: "76561198000000002", health: 80, level: 3, ping: 5 });
  });

  it("gibt leeres Array zurück wenn keine Spieler online", () => {
    expect(parseLp("Total of 0 in the game")).toEqual([]);
  });
});

describe("stripServerLog", () => {
  it("entfernt 7DTD-Server-Logzeilen mit Zeitstempel und behält nur das Befehlsergebnis", () => {
    const raw = [
      "2026-06-12T07:36:07 476.230 ERR IOException in TelnetClient_127.0.0.1:56120: Unable to write data to the transport connection: The socket has been shut down.",
      "2026-06-12T07:36:07 476.231 INF Telnet connection closed: 127.0.0.1:56120",
      "2026-06-12T07:36:07 476.342 INF Executing command 'gettime' by Telnet from 127.0.0.1:56128",
      "Day 2, 05:53",
    ].join("\n");
    expect(stripServerLog(raw)).toBe("Day 2, 05:53");
  });

  it("behält mehrzeilige Befehlsausgaben ohne Zeitstempel (z. B. lp)", () => {
    const raw = [
      "2026-06-12T07:36:01 470.544 INF Executing command 'lp' by Telnet from 127.0.0.1:56120",
      "Total of 1 in the game",
      'Player "Hans", id=76561198000000001, pos=(100, 64, 200), health=100, level=1, ping=0',
    ].join("\n");
    expect(stripServerLog(raw)).toBe(
      'Total of 1 in the game\nPlayer "Hans", id=76561198000000001, pos=(100, 64, 200), health=100, level=1, ping=0',
    );
  });
});

// Minimaler Duplex-Mock für den SSH-forwarded Telnet-Kanal.
class FakeChannel extends EventEmitter {
  writes: string[] = [];
  ended: string[] = [];
  destroyed = false;
  setEncoding() {}
  write(data: string) { this.writes.push(data); return true; }
  end(data?: string) { if (data) this.ended.push(data); queueMicrotask(() => this.emit("close")); }
  destroy() { this.destroyed = true; }
}

function fakeSsh(channel: FakeChannel): { ssh: SshClient; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const ssh = { forwardOut: vi.fn(async () => ({ channel, close })) } as unknown as SshClient;
  return { ssh, close };
}

describe("telnetCommand", () => {
  afterEach(() => vi.useRealTimers());

  it("meldet sich per 'exit' sauber ab statt den Socket abrupt zu zerstören", async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const { ssh, close } = fakeSsh(channel);

    const promise = telnetCommand(ssh, { port: 8081, password: "secret" }, "gettime");
    await vi.advanceTimersByTimeAsync(0);

    channel.emit("data", "Please enter password:");
    expect(channel.writes).toContain("secret\r\n");

    channel.emit("data", "Logon successful");
    expect(channel.writes).toContain("gettime\r\n");

    channel.emit(
      "data",
      "2026-06-12T07:36:07 476.342 INF Executing command 'gettime' by Telnet from 127.0.0.1:56128\nDay 2, 05:53\n",
    );
    await vi.advanceTimersByTimeAsync(300);

    expect(channel.ended).toContain("exit\r\n");
    expect(channel.destroyed).toBe(false);

    const result = await promise;
    expect(result).toBe("Day 2, 05:53");
    expect(close).toHaveBeenCalled();
  });
});
