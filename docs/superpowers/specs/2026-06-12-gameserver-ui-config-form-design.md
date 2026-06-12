# Gameserver-UI: Benutzerfreundliche serverconfig.xml-Konfiguration

**Datum:** 2026-06-12
**Status:** Design genehmigt
**Branch:** `feat/gameserver-ui-config-form`
**Zielversion:** 7DTD V2.6 (b14)

## Problem / Ziel

Die `/config`-Seite zeigt zwar alle `<property>`-Einträge der serverconfig.xml,
aber als rohe Textfelder (kryptische Namen, Freitext-Werte). Ziel:
**alle** ~70 V2.6-Einstellungen über **typgerechte, benutzerfreundliche Controls**
(Dropdowns, Toggles, Slider, Stepper) editierbar machen — gruppiert, durchsuchbar,
mit Beschreibungen. Maps per Dropdown auswählbar (dynamisch vom Server).

## Datenquelle (versionsgenau)

Schema kuratiert aus der **mitgelieferten serverconfig.xml des laufenden Servers**
(`/home/sdtdserver/serverfiles/serverconfig.xml`, V2.6 b14) — Properties, Defaults,
Enum-Werte, Ranges und Beschreibungen stammen aus deren XML-Kommentaren.
**Versions-Drift:** Properties im File ohne Schema-Eintrag → Gruppe „Sonstige" als
Textfeld (vorwärtskompatibel). Schema wird bei Game-Updates nachgezogen.

## Design

### Schema-Modul `src/lib/configSchema.ts`

Kuratierte Liste aller V2.6-Properties:
```ts
type FieldType = "text" | "password" | "int" | "float" | "bool" | "enum" | "world";
interface FieldDef {
  name; label; category; type; description; default;
  options?: { value: string; label: string }[];   // enum
  min?; max?; step?; unit?;                          // int/float (min&max gesetzt ⇒ Slider)
}
export const CONFIG_SCHEMA: FieldDef[];
export const CATEGORIES: string[];   // geordnet
```

### Kategorien (~8 grobe Gruppen + Sonstige)

1. **Server** (Repräsentation, Netzwerk, Slots)
2. **Admin & Schnittstellen** (WebDashboard, Telnet, Terminal)
3. **Welt & Spielregeln** (GameWorld, WorldGen*, GameMode, DayNightLength, DeathPenalty, DropOn*, Bedroll*, …)
4. **Schwierigkeit & Zombies** (GameDifficulty, *Damage*, XPMultiplier, SafeZone*, Enemy*, Zombie*Move, AISmellMode, BloodMoon*)
5. **Loot** (LootAbundance, LootRespawnDays, AirDrop*)
6. **Multiplayer & Landclaim** (PartySharedKillRange, PlayerKillingMode, LandClaim*)
7. **Performance & Technik** (MaxSpawned*, ViewDistance, MeshLayers, DynamicMesh*, EAC, Crossplay, Hide*, MaxChunkAge, SaveDataLimit, AdminFileName, …)
8. **Integrationen & Quests** (Twitch*, QuestProgressionDailyLimit)
9. **Sonstige** (unbekannte Properties aus dem File) + **Experten (XML)** als eigener Modus

Akkordeon, Start eingeklappt; Suchfeld oben filtert Felder und klappt Treffer auf.

### Control-Mapping je Datentyp

- **enum** → Dropdown mit Klartext-Labels (z. B. `ServerVisibility` 0/1/2 → Nicht
  gelistet/Nur Freunde/Öffentlich; `GameDifficulty` 0–5; `ZombieMove`/… 0–4
  Gehen/Joggen/Rennen/Sprinten/Albtraum; `DeathPenalty`, `DropOnDeath`,
  `PlayerKillingMode`, `LandClaimDecayMode`, `AllowSpawnNearFriend`,
  `CameraRestrictionMode`, `EnemyDifficulty`, `AISmellMode`, `ZombieFeralSense`,
  `HideCommandExecutionLog`, `Region`, `WorldGenSize`, `JarRefund`, `GameMode`)
- **world** (dynamisch) → Dropdown aus `GET /api/worlds` (`RWG` + vorhandene Welten);
  aktueller Wert wird ergänzt, falls nicht gelistet. Nur `GameWorld`.
- **bool** → Toggle/Switch (`true`/`false`)
- **int mit min&max** → Slider + Zahlfeld (z. B. `XPMultiplier`/`LootAbundance`
  0–300 %, `ServerMaxAllowedViewDistance` 6–12, `BlockDamage*` %)
- **int/float offen** → Zahl-Stepper mit Einheit (z. B. `DayNightLength` Min,
  `LandClaimSize` Blöcke, `BloodMoonFrequency` Tage)
- **text** → Textfeld · **password** → maskiertes Feld
- Jedes Feld: Label + Beschreibung (Hilfetext) + **Default als Hinweis** („Standard: …").

### UX-Komfort

- **Geänderte Felder hervorheben**: Felder mit nicht-gespeichertem Wert ≠ Dateiwert
  bekommen einen Marker; Speichern-Button zeigt Zähler „N Änderungen".
- Beschreibungen/Defaults aus dem Schema; Passwortfelder maskiert.

### Worlds-Endpoint `GET /api/worlds`

VM muss laufen. Listet via SSH die Welt-Verzeichnisse
(`serverfiles/Data/Worlds` + `.local/share/7DaysToDie/GeneratedWorlds`) im Container,
liefert `{ worlds: string[] }` (immer inkl. `RWG`, dedupliziert, sortiert).

### Speichern („alles konfigurierbar")

`serializeProperties` wird erweitert: vorhandene Properties werden ersetzt,
**fehlende vor `</ServerSettings>` ergänzt** (`\t<property name="X" value="Y"/>`),
keine Duplikate. Save-Flow unverändert (XML schreiben → `docker restart` → NAS-Persist).

## Fehler/Edge cases

- `/api/worlds` & `/api/config`: VM nicht `Running` → 503; SSH-Fehler → 502.
- Einige Settings greifen erst bei neuem Spielstand (WorldGen*, GameName) — Hinweis
  im Hilfetext; Save startet dennoch neu.
- Wert-Coercion: enum/world nur gültige Optionen; int/float per min/max begrenzt.

## Tests (TDD)

- `configSchema`: jede bekannte V2.6-Property hat genau einen Eintrag; valide
  `type`; enum-Felder haben `options`; int-mit-Slider haben `min`&`max`.
- `serializeProperties`: ersetzt vorhandene; **ergänzt fehlende** vor
  `</ServerSettings>`; keine Duplikate; XML bleibt valide.
- `buildConfigModel(xml, schema)`-Helper: mergt Schema-Defaults + Dateiwerte +
  unbekannte Properties (→ Sonstige); markiert Quelle.
- `parseWorlds(lsOutput)`: dedupliziert, fügt `RWG` hinzu, sortiert.

## Out of Scope (YAGNI)

- „Auf Default zurücksetzen"-Buttons, Abweichungs-Filter, Diff-Vorschau, Presets.
- Live-Parsing der XML-Kommentare (Schema ist kuratiert).
- Validierung serverseitig über die min/max hinaus.
