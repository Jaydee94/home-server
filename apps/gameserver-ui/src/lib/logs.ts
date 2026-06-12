const CONTAINER = "7dtd-server";
const TAIL_LINES = 2000;

// `docker logs` sammelt Ausgaben über Container-Neustarts hinweg an. Um nur den
// aktuellen Server-Start zu zeigen, ab `.State.StartedAt` filtern (--since) — der
// Wert wird bei `docker restart` (UI „Mods anwenden") und beim VM-Reboot neu
// gesetzt. Zusätzlich auf die letzten N Zeilen begrenzen.
export function buildContainerLogsCommand(
  container: string = CONTAINER,
  tail: number = TAIL_LINES
): string {
  return (
    `sudo docker logs -f ` +
    `--since "$(sudo docker inspect -f '{{.State.StartedAt}}' ${container})" ` +
    `--tail=${tail} ${container} 2>&1`
  );
}
