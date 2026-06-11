import { describe, it, expect } from "vitest";
import { parseLp } from "@/lib/telnet";

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
