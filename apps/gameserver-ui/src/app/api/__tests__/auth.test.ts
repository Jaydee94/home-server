import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";

// Zweite Schutzschicht neben der Middleware: jede zustandsändernde Route prüft die
// Session selbst. Ohne Session muss jede mit 401 antworten, bevor sie die VM anfasst.
const touched = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/session")>()),
  requireSession: async () => NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }),
}));
vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus: touched, start: touched, stop: touched }) } }));
vi.mock("@/lib/ssh", () => ({
  SshClient: { fromEnv: () => { touched(); return {}; } },
  LONG_EXEC_TIMEOUT_MS: 1,
}));

import { PUT as configPut } from "@/app/api/config/route";
import { POST as playersPost } from "@/app/api/players/route";
import { POST as restartPost } from "@/app/api/restart/route";
import { POST as vmPost } from "@/app/api/vm/route";
import { DELETE as modDelete } from "@/app/api/mods/[name]/route";
import { POST as backupPost } from "@/app/api/backups/route";
import { DELETE as backupDelete } from "@/app/api/backups/[name]/route";
import { POST as restorePost } from "@/app/api/backups/[name]/restore/route";
import { POST as consolePost } from "@/app/api/console/route";

const req = () => new Request("http://x/api", { method: "POST", body: JSON.stringify({ xml: "<a/>", command: "lp", action: "start" }) });
const ctx = { params: Promise.resolve({ name: "x" }) };

describe("requireSession in zustandsändernden Routen", () => {
  it.each([
    ["PUT /api/config", () => configPut(req())],
    ["POST /api/players", () => playersPost(req())],
    ["POST /api/restart", () => restartPost()],
    ["POST /api/vm", () => vmPost(req())],
    ["DELETE /api/mods/[name]", () => modDelete(req(), ctx)],
    ["POST /api/backups", () => backupPost()],
    ["DELETE /api/backups/[name]", () => backupDelete(req(), ctx)],
    ["POST /api/backups/[name]/restore", () => restorePost(req(), ctx)],
    ["POST /api/console", () => consolePost(req())],
  ])("%s antwortet ohne Session mit 401 und fasst die VM nicht an", async (_n, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(touched).not.toHaveBeenCalled();
  });
});
