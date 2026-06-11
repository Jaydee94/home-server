import { describe, it, expect, vi, beforeEach } from "vitest";

const { getStatus, telnetCommandMock, parseLpMock } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  telnetCommandMock: vi.fn(),
  parseLpMock: vi.fn(),
}));

vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/telnet", () => ({
  telnetCommand: telnetCommandMock,
  parseLp: parseLpMock,
  telnetOptsFromEnv: vi.fn().mockReturnValue({ host: "10.0.0.1", port: 8081, password: "pw" }),
}));

import { GET, POST } from "@/app/api/players/route";

beforeEach(() => vi.clearAllMocks());

describe("/api/players", () => {
  it("GET liefert Spielerliste wenn VM läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    telnetCommandMock.mockResolvedValue("Total of 1 in the game\nPlayer...");
    parseLpMock.mockReturnValue([{ name: "Hans", id: "1", health: 100, level: 1, ping: 5 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).players).toHaveLength(1);
  });

  it("GET gibt 503 wenn VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("POST broadcast sendet say-Befehl", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    telnetCommandMock.mockResolvedValue("");
    const res = await POST(new Request("http://x/api/players", {
      method: "POST", body: JSON.stringify({ action: "broadcast", message: "Hallo!" }),
    }));
    expect(res.status).toBe(200);
    expect(telnetCommandMock).toHaveBeenCalledWith(expect.any(Object), "say Hallo!");
  });

  it("POST saveworld sendet saveworld-Befehl", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    telnetCommandMock.mockResolvedValue("World saved");
    const res = await POST(new Request("http://x/api/players", {
      method: "POST", body: JSON.stringify({ action: "saveworld" }),
    }));
    expect(res.status).toBe(200);
    expect(telnetCommandMock).toHaveBeenCalledWith(expect.any(Object), "saveworld");
  });

  it("POST mit ungültiger action gibt 400", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    const res = await POST(new Request("http://x/api/players", {
      method: "POST", body: JSON.stringify({ action: "explode" }),
    }));
    expect(res.status).toBe(400);
  });
});
