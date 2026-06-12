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
