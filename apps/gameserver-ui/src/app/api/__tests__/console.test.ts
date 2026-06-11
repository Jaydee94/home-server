import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus: async () => ({ vmiPhase: "Running", ipAddress: "10.0.0.1" }) }) } }));
vi.mock("@/lib/ssh", () => ({ SshClient: { fromEnv: () => ({}) } }));
vi.mock("@/lib/telnet", () => ({ telnetCommand: vi.fn(async () => "Day 7, 08:30"), telnetOptsFromEnv: () => ({ port: 8081, password: "x" }) }));

import { POST } from "../console/route";
import { telnetCommand } from "@/lib/telnet";

describe("POST /api/console", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects empty command", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ command: "" }) }));
    expect(res.status).toBe(400);
  });
  it("rejects commands with control characters", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ command: "gettime\nsay hi" }) }));
    expect(res.status).toBe(400);
  });
  it("runs the command and returns the output", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ command: "gettime" }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ output: "Day 7, 08:30" });
    expect(telnetCommand).toHaveBeenCalledWith(expect.anything(), expect.anything(), "gettime");
  });
});
