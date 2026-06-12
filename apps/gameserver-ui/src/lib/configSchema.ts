// Kuratiertes Schema der 7DTD serverconfig.xml (Zielversion V2.6 b14).
// Quelle: mitgelieferte serverconfig.xml des Servers (Defaults, Enum-Werte, Ranges
// und Beschreibungen aus deren XML-Kommentaren). Properties im File ohne Eintrag hier
// landen in der Gruppe "Sonstige" als Textfeld (vorwärtskompatibel bei Game-Updates).

export type FieldType = "text" | "password" | "int" | "float" | "bool" | "enum" | "world";

export interface EnumOption { value: string; label: string }

export interface FieldDef {
  name: string;
  label: string;
  category: string;
  type: FieldType;
  description: string;
  default: string;
  options?: EnumOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  slider?: boolean;
}

export const CATEGORIES: string[] = [
  "Server",
  "Admin & Schnittstellen",
  "Welt & Spielregeln",
  "Schwierigkeit & Zombies",
  "Loot",
  "Multiplayer & Landclaim",
  "Performance & Technik",
  "Integrationen & Quests",
  "Sonstige",
];

// Geteilte Enum-Optionen
const MOVE: EnumOption[] = [
  { value: "0", label: "0 – Gehen" },
  { value: "1", label: "1 – Joggen" },
  { value: "2", label: "2 – Rennen" },
  { value: "3", label: "3 – Sprinten" },
  { value: "4", label: "4 – Albtraum" },
];
const SMELL: EnumOption[] = [{ value: "0", label: "0 – Aus" }, ...MOVE.map((o) => ({ value: String(Number(o.value) + 1), label: `${Number(o.value) + 1} – ${o.label.split("– ")[1]}` }))];

export const CONFIG_SCHEMA: FieldDef[] = [
  // ---------- Server ----------
  { name: "ServerName", label: "Servername", category: "Server", type: "text", default: "My Game Host", description: "Name des Servers, wie er im Server-Browser erscheint." },
  { name: "ServerDescription", label: "Beschreibung", category: "Server", type: "text", default: "A 7 Days to Die server", description: "Server-Beschreibung im Server-Browser." },
  { name: "ServerWebsiteURL", label: "Website-URL", category: "Server", type: "text", default: "", description: "Klickbarer Website-Link im Server-Browser." },
  { name: "ServerPassword", label: "Server-Passwort", category: "Server", type: "password", default: "", description: "Passwort zum Betreten des Servers (leer = offen)." },
  { name: "ServerLoginConfirmationText", label: "Login-Bestätigungstext", category: "Server", type: "text", default: "", description: "Wird beim Beitreten angezeigt und muss bestätigt werden." },
  { name: "Region", label: "Region", category: "Server", type: "enum", default: "NorthAmericaEast", description: "Region des Servers.", options: ["NorthAmericaEast", "NorthAmericaWest", "CentralAmerica", "SouthAmerica", "Europe", "Russia", "Asia", "MiddleEast", "Africa", "Oceania"].map((v) => ({ value: v, label: v })) },
  { name: "Language", label: "Sprache", category: "Server", type: "text", default: "English", description: "Primärsprache (englischer Name, z. B. 'German')." },
  { name: "ServerPort", label: "Server-Port", category: "Server", type: "int", default: "26900", min: 1024, max: 65535, description: "Port, auf dem der Server lauscht (LAN: 26900–26905 oder 27015–27020)." },
  { name: "ServerVisibility", label: "Sichtbarkeit", category: "Server", type: "enum", default: "2", description: "Sichtbarkeit im Server-Browser.", options: [{ value: "2", label: "Öffentlich" }, { value: "1", label: "Nur Freunde" }, { value: "0", label: "Nicht gelistet" }] },
  { name: "ServerDisabledNetworkProtocols", label: "Deaktivierte Netzwerkprotokolle", category: "Server", type: "text", default: "SteamNetworking", description: "Komma-getrennt. Mögliche Werte: LiteNetLib, SteamNetworking." },
  { name: "ServerMaxWorldTransferSpeedKiBs", label: "Max. Welt-Transferrate", category: "Server", type: "int", default: "512", unit: "kiB/s", min: 0, max: 1300, description: "Maximale Übertragungsrate der Welt an neue Clients (max. ~1300)." },
  { name: "ServerMaxPlayerCount", label: "Max. Spieler", category: "Server", type: "int", default: "8", min: 1, max: 64, slider: true, description: "Maximale Anzahl gleichzeitiger Spieler." },
  { name: "ServerReservedSlots", label: "Reservierte Slots", category: "Server", type: "int", default: "0", min: 0, description: "Slots, die nur Spielern mit bestimmter Berechtigung offenstehen." },
  { name: "ServerReservedSlotsPermission", label: "Berechtigung reservierte Slots", category: "Server", type: "int", default: "100", description: "Benötigte Berechtigungsstufe für reservierte Slots." },
  { name: "ServerAdminSlots", label: "Admin-Slots", category: "Server", type: "int", default: "0", min: 0, description: "So viele Admins dürfen auch bei vollem Server beitreten." },
  { name: "ServerAdminSlotsPermission", label: "Berechtigung Admin-Slots", category: "Server", type: "int", default: "0", description: "Benötigte Berechtigungsstufe für Admin-Slots." },

  // ---------- Admin & Schnittstellen ----------
  { name: "WebDashboardEnabled", label: "Web-Dashboard", category: "Admin & Schnittstellen", type: "bool", default: "false", description: "Web-Dashboard aktivieren/deaktivieren." },
  { name: "WebDashboardPort", label: "Web-Dashboard-Port", category: "Admin & Schnittstellen", type: "int", default: "8080", min: 1, max: 65535, description: "Port des Web-Dashboards." },
  { name: "WebDashboardUrl", label: "Web-Dashboard-URL", category: "Admin & Schnittstellen", type: "text", default: "", description: "Externe URL, falls hinter Reverse-Proxy." },
  { name: "EnableMapRendering", label: "Map-Rendering", category: "Admin & Schnittstellen", type: "bool", default: "false", description: "Rendern der Karte zu Kacheln (für Web-Dashboard)." },
  { name: "TelnetEnabled", label: "Telnet", category: "Admin & Schnittstellen", type: "bool", default: "true", description: "Telnet-Schnittstelle aktivieren (von dieser UI benötigt)." },
  { name: "TelnetPort", label: "Telnet-Port", category: "Admin & Schnittstellen", type: "int", default: "8081", min: 1, max: 65535, description: "Port des Telnet-Servers." },
  { name: "TelnetPassword", label: "Telnet-Passwort", category: "Admin & Schnittstellen", type: "password", default: "", description: "Passwort für Telnet (leer = nur lokales Loopback)." },
  { name: "TelnetFailedLoginLimit", label: "Telnet Fehlversuche-Limit", category: "Admin & Schnittstellen", type: "int", default: "10", min: 0, description: "Nach so vielen Fehlversuchen wird der Client blockiert." },
  { name: "TelnetFailedLoginsBlocktime", label: "Telnet Sperrdauer", category: "Admin & Schnittstellen", type: "int", default: "10", unit: "s", min: 0, description: "Dauer der Sperre in Sekunden." },
  { name: "TerminalWindowEnabled", label: "Terminal-Fenster", category: "Admin & Schnittstellen", type: "bool", default: "true", description: "Terminal-Fenster für Log/Eingabe (nur Windows)." },

  // ---------- Welt & Spielregeln ----------
  { name: "GameWorld", label: "Welt / Map", category: "Welt & Spielregeln", type: "world", default: "Navezgane", description: "Welt: 'RWG' (zufällig generiert) oder ein vorhandener Welt-Name. Greift erst bei neuem Spielstand." },
  { name: "WorldGenSeed", label: "Welt-Seed", category: "Welt & Spielregeln", type: "text", default: "MyGame", description: "Seed für RWG-Weltgenerierung. Greift erst bei neuem Spielstand." },
  { name: "WorldGenSize", label: "Welt-Größe", category: "Welt & Spielregeln", type: "enum", default: "6144", description: "Größe der RWG-Welt (Vielfaches von 2048).", options: [{ value: "6144", label: "6144 (klein)" }, { value: "8192", label: "8192 (mittel)" }, { value: "10240", label: "10240 (groß)" }] },
  { name: "GameName", label: "Spiel-/Speichername", category: "Welt & Spielregeln", type: "text", default: "MyGame", description: "Name des Spielstands (erlaubt: A-Za-z0-9_-. )." },
  { name: "GameMode", label: "Spielmodus", category: "Welt & Spielregeln", type: "enum", default: "GameModeSurvival", description: "Spielmodus.", options: [{ value: "GameModeSurvival", label: "Survival" }] },
  { name: "BuildCreate", label: "Kreativmodus (Cheat)", category: "Welt & Spielregeln", type: "bool", default: "false", description: "Cheat-/Baumodus an/aus." },
  { name: "DayNightLength", label: "Tageslänge", category: "Welt & Spielregeln", type: "int", default: "60", unit: "Min", min: 10, max: 180, slider: true, description: "Echtzeit-Minuten pro Ingame-Tag." },
  { name: "DayLightLength", label: "Tageslicht-Stunden", category: "Welt & Spielregeln", type: "int", default: "18", unit: "Std", min: 0, max: 24, slider: true, description: "Ingame-Stunden Sonnenschein pro Tag." },
  { name: "BiomeProgression", label: "Biom-Gefahren", category: "Welt & Spielregeln", type: "bool", default: "true", description: "Biom-Gefahren aktivieren." },
  { name: "StormFreq", label: "Sturmhäufigkeit", category: "Welt & Spielregeln", type: "int", default: "100", unit: "%", min: 0, max: 500, step: 50, slider: true, description: "Häufigkeit von Stürmen (0 % = aus)." },
  { name: "DeathPenalty", label: "Todesstrafe", category: "Welt & Spielregeln", type: "enum", default: "1", description: "Strafe nach dem Tod.", options: [{ value: "0", label: "0 – Nichts" }, { value: "1", label: "1 – Klassische XP-Strafe" }, { value: "2", label: "2 – Verletzt" }, { value: "3", label: "3 – Permadeath" }] },
  { name: "DropOnDeath", label: "Verlust bei Tod", category: "Welt & Spielregeln", type: "enum", default: "1", description: "Was beim Tod fallen gelassen wird.", options: [{ value: "0", label: "0 – Nichts" }, { value: "1", label: "1 – Alles" }, { value: "2", label: "2 – Nur Gürtel" }, { value: "3", label: "3 – Nur Rucksack" }, { value: "4", label: "4 – Alles löschen" }] },
  { name: "DropOnQuit", label: "Verlust bei Verlassen", category: "Welt & Spielregeln", type: "enum", default: "0", description: "Was beim Verlassen fallen gelassen wird.", options: [{ value: "0", label: "0 – Nichts" }, { value: "1", label: "1 – Alles" }, { value: "2", label: "2 – Nur Gürtel" }, { value: "3", label: "3 – Nur Rucksack" }] },
  { name: "BedrollDeadZoneSize", label: "Schlafsack-Sperrzone", category: "Welt & Spielregeln", type: "int", default: "15", unit: "Blöcke", min: 0, description: "Radius, in dem keine Zombies um den Schlafsack spawnen." },
  { name: "BedrollExpiryTime", label: "Schlafsack-Ablauf", category: "Welt & Spielregeln", type: "int", default: "45", unit: "Tage", min: 0, description: "Reale Tage, die ein Schlafsack nach letzter Online-Zeit aktiv bleibt." },
  { name: "AllowSpawnNearFriend", label: "Spawn bei Freund", category: "Welt & Spielregeln", type: "enum", default: "2", description: "Dürfen neue Spieler nahe Freunden spawnen?", options: [{ value: "0", label: "0 – Deaktiviert" }, { value: "1", label: "1 – Immer" }, { value: "2", label: "2 – Nur im Wald-Biom" }] },
  { name: "CameraRestrictionMode", label: "Kamera-Einschränkung", category: "Welt & Spielregeln", type: "enum", default: "0", description: "Erlaubte Kamera-Perspektiven.", options: [{ value: "0", label: "0 – Frei wählbar" }, { value: "1", label: "1 – Nur Ego-Perspektive" }, { value: "2", label: "2 – Nur 3rd-Person" }] },
  { name: "JarRefund", label: "Glas-Rückerstattung", category: "Welt & Spielregeln", type: "enum", default: "60", description: "Prozentsatz leerer Gläser nach Konsum.", options: [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => ({ value: String(v), label: `${v} %` })) },

  // ---------- Schwierigkeit & Zombies ----------
  { name: "GameDifficulty", label: "Schwierigkeit", category: "Schwierigkeit & Zombies", type: "enum", default: "1", description: "Spielschwierigkeit (0 = am leichtesten, 5 = am schwersten).", options: [{ value: "0", label: "0 – Sehr leicht" }, { value: "1", label: "1 – Leicht" }, { value: "2", label: "2 – Mittel" }, { value: "3", label: "3 – Schwer" }, { value: "4", label: "4 – Sehr schwer" }, { value: "5", label: "5 – Albtraum" }] },
  { name: "BlockDamagePlayer", label: "Blockschaden Spieler", category: "Schwierigkeit & Zombies", type: "int", default: "100", unit: "%", min: 0, max: 500, step: 10, slider: true, description: "Schaden, den Spieler an Blöcken anrichten." },
  { name: "BlockDamageAI", label: "Blockschaden KI", category: "Schwierigkeit & Zombies", type: "int", default: "100", unit: "%", min: 0, max: 500, step: 10, slider: true, description: "Schaden, den KI an Blöcken anrichtet." },
  { name: "BlockDamageAIBM", label: "Blockschaden KI (Blutmond)", category: "Schwierigkeit & Zombies", type: "int", default: "100", unit: "%", min: 0, max: 500, step: 10, slider: true, description: "Block-Schaden der KI während Blutmond." },
  { name: "XPMultiplier", label: "XP-Multiplikator", category: "Schwierigkeit & Zombies", type: "int", default: "100", unit: "%", min: 0, max: 300, step: 5, slider: true, description: "XP-Gewinn-Multiplikator." },
  { name: "PlayerSafeZoneLevel", label: "Safezone-Level", category: "Schwierigkeit & Zombies", type: "int", default: "5", min: 0, description: "Bis zu diesem Level erzeugt ein Spieler beim Spawn eine Safezone." },
  { name: "PlayerSafeZoneHours", label: "Safezone-Dauer", category: "Schwierigkeit & Zombies", type: "int", default: "5", unit: "Std", min: 0, description: "Wie lange (Weltzeit) die Safezone besteht." },
  { name: "EnemySpawnMode", label: "Gegner-Spawn", category: "Schwierigkeit & Zombies", type: "bool", default: "true", description: "Gegner-Spawning aktivieren/deaktivieren." },
  { name: "EnemyDifficulty", label: "Gegner-Schwierigkeit", category: "Schwierigkeit & Zombies", type: "enum", default: "0", description: "Normale oder feral (wilde) Gegner.", options: [{ value: "0", label: "0 – Normal" }, { value: "1", label: "1 – Feral" }] },
  { name: "ZombieFeralSense", label: "Feral-Sinn", category: "Schwierigkeit & Zombies", type: "enum", default: "0", description: "Wann Zombies erhöhte Wahrnehmung haben.", options: [{ value: "0", label: "0 – Aus" }, { value: "1", label: "1 – Tag" }, { value: "2", label: "2 – Nacht" }, { value: "3", label: "3 – Immer" }] },
  { name: "ZombieMove", label: "Zombie-Tempo (Tag)", category: "Schwierigkeit & Zombies", type: "enum", default: "0", description: "Bewegungstempo tagsüber.", options: MOVE },
  { name: "ZombieMoveNight", label: "Zombie-Tempo (Nacht)", category: "Schwierigkeit & Zombies", type: "enum", default: "3", description: "Bewegungstempo nachts.", options: MOVE },
  { name: "ZombieFeralMove", label: "Zombie-Tempo (Feral)", category: "Schwierigkeit & Zombies", type: "enum", default: "3", description: "Bewegungstempo feraler Zombies.", options: MOVE },
  { name: "ZombieBMMove", label: "Zombie-Tempo (Blutmond)", category: "Schwierigkeit & Zombies", type: "enum", default: "3", description: "Bewegungstempo während Blutmond.", options: MOVE },
  { name: "AISmellMode", label: "KI-Geruchssinn", category: "Schwierigkeit & Zombies", type: "enum", default: "3", description: "Geruchswahrnehmung der KI.", options: SMELL },
  { name: "BloodMoonFrequency", label: "Blutmond-Frequenz", category: "Schwierigkeit & Zombies", type: "int", default: "7", unit: "Tage", min: 0, description: "Alle wie viele Tage ein Blutmond stattfindet (0 = nie)." },
  { name: "BloodMoonRange", label: "Blutmond-Streuung", category: "Schwierigkeit & Zombies", type: "int", default: "0", unit: "Tage", min: 0, description: "Zufällige Abweichung vom Blutmond-Tag (0 = exakt)." },
  { name: "BloodMoonWarning", label: "Blutmond-Warnung", category: "Schwierigkeit & Zombies", type: "int", default: "8", unit: "Std", min: -1, description: "Stunde, ab der die rote Tageszahl erscheint (-1 = nie)." },
  { name: "BloodMoonEnemyCount", label: "Blutmond-Gegner", category: "Schwierigkeit & Zombies", type: "int", default: "8", min: 0, max: 64, slider: true, description: "Gleichzeitig lebende Zombies pro Spieler im Blutmond (von MaxSpawnedZombies begrenzt)." },

  // ---------- Loot ----------
  { name: "LootAbundance", label: "Loot-Menge", category: "Loot", type: "int", default: "100", unit: "%", min: 0, max: 300, step: 5, slider: true, description: "Loot-Menge in Prozent." },
  { name: "LootRespawnDays", label: "Loot-Respawn", category: "Loot", type: "int", default: "7", unit: "Tage", min: 0, description: "Tage bis Loot wieder auffüllt." },
  { name: "AirDropFrequency", label: "Airdrop-Frequenz", category: "Loot", type: "int", default: "72", unit: "Std", min: 0, description: "Alle wie viele Ingame-Stunden ein Airdrop fällt (0 = nie)." },
  { name: "AirDropMarker", label: "Airdrop-Marker", category: "Loot", type: "bool", default: "true", description: "Marker für Airdrops auf Karte/Kompass anzeigen." },

  // ---------- Multiplayer & Landclaim ----------
  { name: "PartySharedKillRange", label: "Gruppen-Kill-Reichweite", category: "Multiplayer & Landclaim", type: "int", default: "100", unit: "m", min: 0, description: "Distanz für geteilte Kill-XP und Quest-Credits." },
  { name: "PlayerKillingMode", label: "PvP-Modus", category: "Multiplayer & Landclaim", type: "enum", default: "3", description: "Spieler-Tötungs-Einstellungen.", options: [{ value: "0", label: "0 – Kein Töten" }, { value: "1", label: "1 – Nur Verbündete" }, { value: "2", label: "2 – Nur Fremde" }, { value: "3", label: "3 – Alle" }] },
  { name: "LandClaimCount", label: "Landclaims pro Spieler", category: "Multiplayer & Landclaim", type: "int", default: "5", min: 0, description: "Maximale Anzahl Landclaims pro Spieler." },
  { name: "LandClaimSize", label: "Landclaim-Größe", category: "Multiplayer & Landclaim", type: "int", default: "41", unit: "Blöcke", min: 1, description: "Geschützte Fläche um einen Keystone (in Blöcken)." },
  { name: "LandClaimDeadZone", label: "Landclaim-Mindestabstand", category: "Multiplayer & Landclaim", type: "int", default: "30", unit: "Blöcke", min: 0, description: "Mindestabstand zwischen Keystones (außer bei Freunden)." },
  { name: "LandClaimExpiryTime", label: "Landclaim-Ablauf", category: "Multiplayer & Landclaim", type: "int", default: "7", unit: "Tage", min: 0, description: "Reale Tage offline, bis Claims ablaufen." },
  { name: "LandClaimDecayMode", label: "Landclaim-Verfall", category: "Multiplayer & Landclaim", type: "enum", default: "0", description: "Wie der Schutz offline verfällt.", options: [{ value: "0", label: "0 – Langsam (linear)" }, { value: "1", label: "1 – Schnell (exponentiell)" }, { value: "2", label: "2 – Kein Verfall" }] },
  { name: "LandClaimOnlineDurabilityModifier", label: "Härte online", category: "Multiplayer & Landclaim", type: "int", default: "4", unit: "x", min: 0, description: "Block-Härte im Claim bei Online-Spieler (0 = unzerstörbar)." },
  { name: "LandClaimOfflineDurabilityModifier", label: "Härte offline", category: "Multiplayer & Landclaim", type: "int", default: "4", unit: "x", min: 0, description: "Block-Härte im Claim bei Offline-Spieler (0 = unzerstörbar)." },
  { name: "LandClaimOfflineDelay", label: "Offline-Verzögerung", category: "Multiplayer & Landclaim", type: "int", default: "0", unit: "Min", min: 0, description: "Minuten nach Logout bis Übergang online→offline." },

  // ---------- Performance & Technik ----------
  { name: "MaxSpawnedZombies", label: "Max. Zombies (Map)", category: "Performance & Technik", type: "int", default: "64", min: 0, max: 256, slider: true, description: "Zombies gleichzeitig auf der gesamten Karte. Starker Performance-Einfluss." },
  { name: "MaxSpawnedAnimals", label: "Max. Tiere (Map)", category: "Performance & Technik", type: "int", default: "50", min: 0, max: 256, slider: true, description: "Tiere gleichzeitig auf der Karte." },
  { name: "ServerMaxAllowedViewDistance", label: "Max. Sichtweite", category: "Performance & Technik", type: "int", default: "12", min: 6, max: 12, slider: true, description: "Maximale vom Client anforderbare Sichtweite (6–12). Hoher Speicher-/Performance-Einfluss." },
  { name: "MaxQueuedMeshLayers", label: "Max. Mesh-Layer-Queue", category: "Performance & Technik", type: "int", default: "1000", min: 0, description: "Maximale Mesh-Layer in der Generierungs-Queue." },
  { name: "DynamicMeshEnabled", label: "Dynamic Mesh", category: "Performance & Technik", type: "bool", default: "true", description: "Dynamic-Mesh-System aktivieren." },
  { name: "DynamicMeshLandClaimOnly", label: "Dynamic Mesh nur in Claims", category: "Performance & Technik", type: "bool", default: "true", description: "Dynamic Mesh nur in Landclaim-Bereichen aktiv." },
  { name: "DynamicMeshLandClaimBuffer", label: "Dynamic-Mesh-Puffer", category: "Performance & Technik", type: "int", default: "3", min: 0, description: "Chunk-Radius um Landclaims für Dynamic Mesh." },
  { name: "DynamicMeshMaxItemCache", label: "Dynamic-Mesh-Cache", category: "Performance & Technik", type: "int", default: "3", min: 1, description: "Gleichzeitig verarbeitbare Items (höher = mehr RAM)." },
  { name: "ServerAllowCrossplay", label: "Crossplay", category: "Performance & Technik", type: "bool", default: "false", description: "Crossplay aktivieren/deaktivieren." },
  { name: "EACEnabled", label: "EasyAntiCheat", category: "Performance & Technik", type: "bool", default: "true", description: "EasyAntiCheat aktivieren/deaktivieren." },
  { name: "IgnoreEOSSanctions", label: "EOS-Sanktionen ignorieren", category: "Performance & Technik", type: "bool", default: "false", description: "EOS-Sanktionen beim Beitritt ignorieren." },
  { name: "HideCommandExecutionLog", label: "Befehls-Log verbergen", category: "Performance & Technik", type: "enum", default: "0", description: "Logging der Befehlsausführung verbergen.", options: [{ value: "0", label: "0 – Alles zeigen" }, { value: "1", label: "1 – Nur Telnet/Panel verbergen" }, { value: "2", label: "2 – Auch vor Clients" }, { value: "3", label: "3 – Alles verbergen" }] },
  { name: "MaxUncoveredMapChunksPerPlayer", label: "Max. aufgedeckte Chunks", category: "Performance & Technik", type: "int", default: "131072", min: 0, description: "Max. aufdeckbare Karten-Chunks pro Spieler (x · 512 Byte Dateigröße)." },
  { name: "PersistentPlayerProfiles", label: "Feste Spielerprofile", category: "Performance & Technik", type: "bool", default: "false", description: "Spieler müssen mit dem zuletzt genutzten Profil beitreten." },
  { name: "MaxChunkAge", label: "Max. Chunk-Alter", category: "Performance & Technik", type: "int", default: "-1", unit: "Tage", description: "Ingame-Tage bis ein unbesuchter Chunk zurückgesetzt wird (-1 = nie)." },
  { name: "SaveDataLimit", label: "Speicherlimit", category: "Performance & Technik", type: "int", default: "-1", unit: "MB", description: "Max. Speicherplatz pro Spielstand in MB (negativ = unbegrenzt)." },
  { name: "AdminFileName", label: "Admin-Dateiname", category: "Performance & Technik", type: "text", default: "serveradmin.xml", description: "Dateiname der Server-Admin-Datei (relativ zu Saves)." },

  // ---------- Integrationen & Quests ----------
  { name: "TwitchServerPermission", label: "Twitch-Berechtigung", category: "Integrationen & Quests", type: "int", default: "90", description: "Benötigte Berechtigungsstufe für Twitch-Integration." },
  { name: "TwitchBloodMoonAllowed", label: "Twitch im Blutmond", category: "Integrationen & Quests", type: "bool", default: "false", description: "Twitch-Aktionen während Blutmond erlauben (kann Lag verursachen)." },
  { name: "QuestProgressionDailyLimit", label: "Quest-Tageslimit", category: "Integrationen & Quests", type: "int", default: "4", min: 0, description: "Quests pro Tag, die zur Tier-Progression zählen." },
];
