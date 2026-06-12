import type { SshClient } from "@/lib/ssh";
import { telnetCommand, parseLp, type TelnetOptions } from "@/lib/telnet";

const CONTAINER = "7dtd-server";

export interface RestartDeps {
  sleep?: (ms: number) => Promise<void>;
  telnet?: typeof telnetCommand;
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

  const players = parseLp(await telnet(ssh, opts, "lp"));
  if (players.length > 0) {
    await telnet(ssh, opts, "say [Neustart] Server-Neustart in 30 Sekunden - bitte ausloggen");
    await sleep(20_000);
    await telnet(ssh, opts, "say [Neustart] Neustart in 10 Sekunden");
    await sleep(10_000);
  }
  await telnet(ssh, opts, "saveworld");
  await ssh.exec(`sudo docker restart ${CONTAINER}`);
}
