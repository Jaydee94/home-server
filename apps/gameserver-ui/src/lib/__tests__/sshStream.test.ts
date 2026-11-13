import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

// Fake für ssh2: `Client` verbindet "sofort", `exec` liefert einen Kanal, dessen
// stdout/Exit der Test von Hand steuert. So lässt sich prüfen, ob Verbindungen
// wieder abgebaut werden — ohne echte VM.
const h = vi.hoisted(() => ({ clients: [] as unknown[] }));

vi.mock("ssh2", async () => {
  const { EventEmitter } = await import("events");
  const { Duplex, PassThrough } = await import("stream");

  class FakeChannel extends Duplex {
    stderr = new PassThrough();
    written: Buffer[] = [];
    stdinEnded = false;
    close = vi.fn();
    _read() {}
    _write(chunk: Buffer, _enc: string, cb: () => void) { this.written.push(chunk); cb(); }
    _final(cb: () => void) { this.stdinEnded = true; cb(); }
  }

  class Client extends EventEmitter {
    channel?: FakeChannel;
    commands: string[] = [];
    end = vi.fn(() => this);
    destroy = vi.fn(() => this);
    constructor() { super(); h.clients.push(this); }
    connect() { queueMicrotask(() => this.emit("ready")); return this; }
    exec(cmd: string, cb: (err: Error | undefined, ch: FakeChannel) => void) {
      this.commands.push(cmd);
      this.channel = new FakeChannel();
      cb(undefined, this.channel);
      return this;
    }
  }
  return { Client };
});

import { SshClient, DEFAULT_EXEC_TIMEOUT_MS } from "@/lib/ssh";

interface FakeChannel extends NodeJS.EventEmitter {
  written: Buffer[];
  stdinEnded: boolean;
  isPaused(): boolean;
}
interface FakeClient {
  channel?: FakeChannel;
  commands: string[];
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const lastClient = () => h.clients[h.clients.length - 1] as FakeClient;
const tick = () => new Promise((r) => setTimeout(r, 0));
const client = () => new SshClient({ host: "10.0.0.1", user: "ubuntu", privateKey: "key" });

beforeEach(() => { h.clients.length = 0; });

describe("SshClient.stream", () => {
  it("liefert die Ausgabe und schließt die Verbindung am Stream-Ende", async () => {
    const reader = client().stream("echo hi").getReader();
    await tick();
    const conn = lastClient();
    conn.channel!.emit("data", Buffer.from("hi\n"));
    conn.channel!.emit("close", 0);

    const first = await reader.read();
    expect(Buffer.from(first.value!).toString()).toBe("hi\n");
    expect((await reader.read()).done).toBe(true);
    expect(conn.end).toHaveBeenCalled();
  });

  it("cancel() beendet die SSH-Verbindung (Client-Abbruch hinterlässt keine Session)", async () => {
    const reader = client().stream("docker logs -f x").getReader();
    await tick();
    const conn = lastClient();
    expect(conn.destroy).not.toHaveBeenCalled();

    await reader.cancel();
    expect(conn.destroy).toHaveBeenCalled();
  });

  it("cancel() vor dem Verbindungsaufbau schließt die Verbindung, sobald sie steht", async () => {
    const reader = client().stream("docker logs -f x").getReader();
    await reader.cancel();
    await tick();
    const conn = lastClient();
    expect(conn.destroy).toHaveBeenCalled();
    expect(conn.commands).toEqual([]);
  });

  it("Daten und Exit nach cancel() werfen nicht (Controller ist geschlossen)", async () => {
    const reader = client().stream("docker logs -f x").getReader();
    await tick();
    const conn = lastClient();
    await reader.cancel();

    expect(() => conn.channel!.emit("data", Buffer.from("spät"))).not.toThrow();
    expect(() => conn.channel!.emit("close", 1)).not.toThrow();
  });

  it("pausiert den SSH-Kanal, solange niemand liest (kein unbegrenztes Puffern)", async () => {
    const reader = client().stream("docker logs -f x").getReader();
    await tick();
    const conn = lastClient();
    conn.channel!.emit("data", Buffer.from("a"));
    conn.channel!.emit("data", Buffer.from("b"));
    expect(conn.channel!.isPaused()).toBe(true);

    await reader.read();
    await reader.read();
    await tick();
    expect(conn.channel!.isPaused()).toBe(false);
    await reader.cancel();
  });

  it("meldet einen Exit-Code ≠ 0 als Stream-Fehler", async () => {
    const reader = client().stream("false").getReader();
    await tick();
    lastClient().channel!.emit("close", 2);
    await expect(reader.read()).rejects.toThrow("Stream exit 2");
  });
});

describe("SshClient.exec", () => {
  it("liefert stdout und schließt die Verbindung", async () => {
    const p = client().exec("echo hi");
    await tick();
    const conn = lastClient();
    conn.channel!.emit("data", Buffer.from("hi\n"));
    conn.channel!.emit("close", 0);
    await expect(p).resolves.toBe("hi\n");
    expect(conn.end).toHaveBeenCalled();
  });

  it("hat einen Default-Timeout", () => {
    expect(DEFAULT_EXEC_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_EXEC_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it("bricht ein hängendes Kommando nach timeoutMs ab und trennt die Verbindung", async () => {
    const p = client().exec("sleep infinity", { timeoutMs: 20 });
    await expect(p).rejects.toThrow(/timed out/);
    expect(lastClient().destroy).toHaveBeenCalled();
  });

  it("timeoutMs: 0 schaltet den Timeout ab", async () => {
    vi.useFakeTimers();
    try {
      const p = client().exec("lange operation", { timeoutMs: 0 });
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      const conn = lastClient();
      conn.channel!.emit("close", 0);
      await expect(p).resolves.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("piped options.stdin in das Kommando und sendet EOF", async () => {
    const stdin = Readable.from([Buffer.from("teil1"), Buffer.from("teil2")]);
    const p = client().exec("tar xzf -", { stdin, timeoutMs: 0 });
    await tick();
    await tick();
    const conn = lastClient();
    expect(Buffer.concat(conn.channel!.written).toString()).toBe("teil1teil2");
    expect(conn.channel!.stdinEnded).toBe(true);
    conn.channel!.emit("close", 0);
    await expect(p).resolves.toBe("");
  });

  it("meldet einen Fehler der stdin-Quelle und trennt die Verbindung", async () => {
    const stdin = new Readable({ read() { this.destroy(new Error("NAS weg")); } });
    const p = client().exec("tar xzf -", { stdin, timeoutMs: 0 });
    await expect(p).rejects.toThrow("NAS weg");
    expect(lastClient().destroy).toHaveBeenCalled();
  });
});
