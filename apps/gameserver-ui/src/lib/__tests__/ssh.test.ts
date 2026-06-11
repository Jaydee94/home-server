import { describe, it, expect, afterEach } from "vitest";
import { SshClient } from "@/lib/ssh";

describe("SshClient", () => {
  afterEach(() => {
    delete process.env.VM_SSH_KEY_PATH;
    delete process.env.VM_SSH_USER;
  });

  it("Konstruktor akzeptiert host, user und privateKey", () => {
    const client = new SshClient({ host: "10.0.0.1", user: "ubuntu", privateKey: "key" });
    expect(client).toBeDefined();
  });

  it("fromEnv liest VM_SSH_KEY_PATH und VM_SSH_USER aus der Umgebung", () => {
    process.env.VM_SSH_KEY_PATH = "/tmp/nonexistent-key";
    process.env.VM_SSH_USER = "ubuntu";
    expect(() => SshClient.fromEnv("10.0.0.1")).toThrow();
  });
});
