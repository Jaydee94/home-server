import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
const execMock = vi.fn();

vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/ssh", () => ({ SshClient: { fromEnv: () => ({ exec: execMock }) } }));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(false), writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

import { GET, PUT } from "@/app/api/config/route";

beforeEach(() => vi.clearAllMocks());

describe("/api/config", () => {
  it("GET liest serverconfig.xml per SSH", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    execMock.mockResolvedValue('<ServerSettings><property name="ServerName" value="Test"/></ServerSettings>');
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).xml).toContain("ServerName");
  });

  it("GET gibt 503 wenn VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("PUT schreibt Config und startet Docker neu", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    execMock.mockResolvedValue("");
    const xml = '<ServerSettings><property name="ServerName" value="Neu"/></ServerSettings>';
    const res = await PUT(new Request("http://x/api/config", {
      method: "PUT", body: JSON.stringify({ xml }),
    }));
    expect(res.status).toBe(200);
    expect(execMock).toHaveBeenCalledWith(expect.stringContaining("docker restart"));
  });

  it("PUT ohne xml gibt 400", async () => {
    const res = await PUT(new Request("http://x/api/config", {
      method: "PUT", body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });
});
