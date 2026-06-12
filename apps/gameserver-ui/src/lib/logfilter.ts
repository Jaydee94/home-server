// Erkennt Telnet-Verbindungs-Plumbing und Telnet-IOException-Stacktraces in den
// 7DTD-`docker logs`. Diese Zeilen entstehen durch das UI-eigene Telnet-Polling
// und überlagern bei idle-Server das eigentliche Spielgeschehen. Bewusst NICHT
// generisch alle `at …`-Stacktrace-Frames — nur die telnet-spezifischen
// (`TelnetConnection`, `System.Net.Sockets`) —, damit echte Spiel-Exceptions
// sichtbar bleiben.
const NOISE_PATTERNS: RegExp[] = [
  /Telnet connection (from|closed):/,
  /(Started|Exited) thread TelnetClient/,
  /Executing command '.*' by Telnet/,
  /IOException in TelnetClient/,
  /socket has been shut down/i,
  /TelnetConnection[.:]/,
  /System\.Net\.Sockets/,
];

export function isConnectionNoise(line: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(line));
}

// Maximale Anzahl Log-Zeilen, die der Client im Speicher behält. Muss zum
// Server-Tail (`buildContainerLogsCommand`, --tail=2000) passen — ist das
// Client-Limit kleiner, werden die frühen Boot-/[MODS]-Zeilen des aktuellen
// Server-Starts verworfen und sind in der UI nicht mehr sicht-/suchbar.
export const MAX_LOG_LINES = 2000;

// Hängt eine Zeile an und begrenzt den Puffer auf `max` Zeilen (FIFO: älteste
// fällt raus). Reine Funktion, damit das Limit testbar ist.
export function appendLogLine<T>(prev: T[], line: T, max: number = MAX_LOG_LINES): T[] {
  return [...prev.slice(-(max - 1)), line];
}
