import { LONG_EXEC_TIMEOUT_MS, type SshClient } from "@/lib/ssh";
import { telnetCommand, parseLp, type TelnetOptions } from "@/lib/telnet";

const CONTAINER = "7dtd-server";

export interface RestartDeps {
  sleep?: (ms: number) => Promise<void>;
  telnet?: typeof telnetCommand;
  /**
   * Neustart auch dann fortsetzen, wenn Telnet nicht antwortet (Server down, z. B.
   * wegen einer kaputten Config) — ohne Vorwarnung und ohne saveworld. Standard:
   * abbrechen, damit ein laufender Server nicht ungesichert neu startet.
   */
  tolerateTelnetFailure?: boolean;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Startet den 7DTD-Docker-Container auf der VM neu. Sind Spieler online, werden
// sie 30 s vorgewarnt (Broadcast bei 30 s und 10 s); bei 0 Spielern entfällt der
// Countdown. Vor dem Neustart wird die Welt gespeichert. Der eigentliche Neustart
// läuft über `docker restart` statt eines kompletten VM-Stopp/Starts — der schnelle
// Weg, um z. B. hochgeladene Mods zu laden.
export async function restartServer(ssh: SshClient, opts: TelnetOptions, deps: RestartDeps = {}): Promise<void> {
  const sleep = deps.sleep ?? realSleep;
  const telnet = deps.telnet ?? telnetCommand;

  let telnetOk = true;
  let players: ReturnType<typeof parseLp> = [];
  try {
    players = parseLp(await telnet(ssh, opts, "lp"));
  } catch (e) {
    if (!deps.tolerateTelnetFailure) throw e;
    telnetOk = false;
    console.warn("[restart] Telnet nicht erreichbar — Neustart ohne Vorwarnung/saveworld:", e);
  }
  if (players.length > 0) {
    await telnet(ssh, opts, "say [Neustart] Server-Neustart in 30 Sekunden - bitte ausloggen");
    await sleep(20_000);
    await telnet(ssh, opts, "say [Neustart] Neustart in 10 Sekunden");
    await sleep(10_000);
  }
  if (telnetOk) await telnet(ssh, opts, "saveworld");
  await ssh.exec(`sudo docker restart ${CONTAINER}`, { timeoutMs: LONG_EXEC_TIMEOUT_MS });
}
