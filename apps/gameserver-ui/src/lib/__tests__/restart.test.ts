import { describe, it, expect, vi } from "vitest";
import { restartServer } from "@/lib/restart";
import type { SshClient } from "@/lib/ssh";

function fakes(playerOutput: string) {
  const calls: string[] = [];
  const execFn = vi.fn(async (cmd: string) => { void cmd; return ""; });
  const telnet = vi.fn(async (_ssh: SshClient, _opts, cmd: string) => {
    calls.push(cmd);
    return cmd === "lp" ? playerOutput : "";
  });
  const ssh = { exec: execFn } as unknown as SshClient;
  const sleep = vi.fn(async () => {});
  return { calls, execFn, telnet, ssh, sleep };
}

const OPTS = { port: 8081, password: "x" };

describe("restartServer", () => {
  it("speichert vor dem Neustart und startet den Container neu", async () => {
    const f = fakes("Total of 0 in the game");
    await restartServer(f.ssh, OPTS, { sleep: f.sleep, telnet: f.telnet });

    const saveCall = f.telnet.mock.calls.findIndex((c) => c[2] === "saveworld");
    expect(saveCall).toBeGreaterThanOrEqual(0);
    expect(f.execFn).toHaveBeenCalledWith("sudo docker restart 7dtd-server");
    // saveworld (telnet) vor docker restart (ssh.exec)
    const saveOrder = f.telnet.mock.invocationCallOrder[saveCall];
    const restartOrder = f.execFn.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(restartOrder);
  });

  it("überspringt Spieler-Warnung + Countdown bei 0 Spielern", async () => {
    const f = fakes("Total of 0 in the game");
    await restartServer(f.ssh, OPTS, { sleep: f.sleep, telnet: f.telnet });

    expect(f.calls.some((c) => c.startsWith("say "))).toBe(false);
    expect(f.sleep).not.toHaveBeenCalled();
  });

  it("warnt Spieler per Broadcast + Countdown wenn Spieler online sind", async () => {
    const lp =
      "Total of 1 in the game\n0. id=1, Hans, pos=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), remote=True, health=100, deaths=0, zombies=0, players=0, score=0, level=1, pltfmid=Steam_1, crossid=EOS_1, ip=127.0.0.1, ping=0";
    const f = fakes(lp);
    await restartServer(f.ssh, OPTS, { sleep: f.sleep, telnet: f.telnet });

    expect(f.calls.filter((c) => c.startsWith("say ")).length).toBeGreaterThanOrEqual(2);
    expect(f.sleep).toHaveBeenCalled();
    expect(f.execFn).toHaveBeenCalledWith("sudo docker restart 7dtd-server");
  });
});
