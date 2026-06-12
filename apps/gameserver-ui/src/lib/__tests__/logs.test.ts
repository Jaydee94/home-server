import { describe, it, expect } from "vitest";
import { buildContainerLogsCommand } from "@/lib/logs";

describe("buildContainerLogsCommand", () => {
  it("folgt dem Log (-f) und kappt auf 2000 Zeilen", () => {
    const cmd = buildContainerLogsCommand();
    expect(cmd).toContain("docker logs -f");
    expect(cmd).toContain("--tail=2000");
  });
  it("grenzt auf den aktuellen Container-Start ab (--since StartedAt)", () => {
    const cmd = buildContainerLogsCommand();
    expect(cmd).toContain("--since");
    expect(cmd).toContain("docker inspect -f '{{.State.StartedAt}}' 7dtd-server");
  });
  it("referenziert den Default-Container 7dtd-server und leitet stderr um", () => {
    const cmd = buildContainerLogsCommand();
    expect(cmd).toContain("7dtd-server");
    expect(cmd.trim().endsWith("2>&1")).toBe(true);
  });
  it("erlaubt Überschreiben von Container und Tail", () => {
    const cmd = buildContainerLogsCommand("other", 500);
    expect(cmd).toContain("--tail=500");
    expect(cmd).toContain("docker inspect -f '{{.State.StartedAt}}' other");
    expect(cmd).toContain(" other 2>&1");
    expect(cmd).not.toContain("7dtd-server");
  });
});
