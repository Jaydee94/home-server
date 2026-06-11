export interface NavItem { href: string; label: string; icon: string; }
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/players", label: "Spieler", icon: "👥" },
  { href: "/console", label: "Konsole", icon: "❯" },
  { href: "/logs", label: "Logs", icon: "▤" },
  { href: "/config", label: "Config", icon: "⚙" },
  { href: "/backups", label: "Backups", icon: "⛁" },
  { href: "/mods", label: "Mods", icon: "🧩" },
];
