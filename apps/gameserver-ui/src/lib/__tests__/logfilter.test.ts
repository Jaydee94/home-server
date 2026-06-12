import { describe, it, expect } from "vitest";
import { isConnectionNoise, appendLogLine, MAX_LOG_LINES } from "@/lib/logfilter";

describe("isConnectionNoise", () => {
  const noise = [
    "2026-06-12T07:50:00 1309.130 INF Telnet connection from: 127.0.0.1:55732",
    "2026-06-12T07:50:07 1315.679 INF Telnet connection closed: 127.0.0.1:55744",
    "2026-06-12T07:50:00 1309.130 INF Started thread TelnetClient_127.0.0.1:55732",
    "2026-06-12T07:50:00 1309.138 INF Exited thread TelnetClient_127.0.0.1:56128",
    "2026-06-12T07:50:00 1309.258 INF Executing command 'lp' by Telnet from 127.0.0.1:55732",
    "2026-06-12T07:50:00 1309.134 ERR IOException in TelnetClient_127.0.0.1:56128: Unable to write data to the transport connection: The socket has been shut down.",
    "2026-06-12T07:50:00 1309.135 EXC Unable to write data to the transport connection: The socket has been shut down. ---> The socket has been shut down",
    "  at TelnetConnection.handleWriting () [0x0004b] in <2650295aa05440d09c9d79480d2c18c0>:0 ",
    "TelnetConnection:HandlerThread(ThreadInfo)",
    "  at System.Net.Sockets.NetworkStream.Write (System.Byte[] buffer, System.Int32 offset, System.Int32 size) [0x00065] in <b6d85684387445d1bc2505c6de8fed9f>:0 ",
  ];

  const game = [
    "2026-06-12T07:28:57 46.459 INF Dymesh: Awake",
    "2026-06-12T07:28:57 46.587 INF [Steamworks.NET] GameServer.LogOn successful, SteamID=90286909244717062",
    "2026-06-12T08:01:12 INF Player Hans joined the game",
    "2026-06-12T08:01:30 INF Chat (from 'Hans'): hi",
    "2026-06-12T08:02:00 INF GMSG: Player 'Greta' died",
    "2026-06-12T08:03:00 INF Day 7, 22:00 - Blood Moon incoming",
    "2026-06-12T08:04:00 INF Time: 120.00m FPS: 41.2 Heap: 1024.0MB Players: 2 Zombies: 18",
    "2026-06-12T08:05:00 EXC NullReferenceException in BlockDamage handler",
    "  at GameManager.UpdateBlocks () [0x00010] in <abc>:0 ",
  ];

  it.each(noise)("klassifiziert Verbindungs-Rauschen als noise: %s", (line) => {
    expect(isConnectionNoise(line)).toBe(true);
  });

  it.each(game)("lässt echtes Spielgeschehen durch: %s", (line) => {
    expect(isConnectionNoise(line)).toBe(false);
  });
});

describe("appendLogLine", () => {
  it("hängt unterhalb des Limits ohne Verlust an", () => {
    const out = appendLogLine(["a", "b"], "c", 10);
    expect(out).toEqual(["a", "b", "c"]);
  });
  it("verwirft am Limit die älteste Zeile (FIFO), Länge bleibt = max", () => {
    const full = Array.from({ length: 5 }, (_, i) => `line${i}`); // line0..line4
    const out = appendLogLine(full, "neu", 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe("line1"); // line0 (älteste) verworfen
    expect(out[out.length - 1]).toBe("neu");
  });
  it("Client-Limit entspricht dem Server-Tail (2000), damit Boot-Zeilen erhalten bleiben", () => {
    expect(MAX_LOG_LINES).toBe(2000);
  });
});
