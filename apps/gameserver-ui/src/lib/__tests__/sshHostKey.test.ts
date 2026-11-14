import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Modulzustand (einmalige Warnung) → pro Test ein frisches Modul.
const load = async () => {
  vi.resetModules();
  return (await import("@/lib/ssh")).buildHostVerifier();
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); vi.unstubAllEnvs(); });

describe("buildHostVerifier", () => {
  it("warnt ohne VM_SSH_HOST_FINGERPRINT nur EINMAL pro Prozess, nicht pro Verbindung", async () => {
    vi.stubEnv("VM_SSH_HOST_FINGERPRINT", "");
    const verify = await load();
    expect(verify(Buffer.from("aa", "hex"))).toBe(true);
    expect(verify(Buffer.from("bb", "hex"))).toBe(true);
    expect(verify(Buffer.from("cc", "hex"))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("VM_SSH_HOST_FINGERPRINT");
  });

  it("akzeptiert nur den gepinnten Fingerprint und warnt dann nicht", async () => {
    vi.stubEnv("VM_SSH_HOST_FINGERPRINT", "aabb");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const verify = await load();
    expect(verify(Buffer.from("aabb", "hex"))).toBe(true);
    expect(verify(Buffer.from("ccdd", "hex"))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
