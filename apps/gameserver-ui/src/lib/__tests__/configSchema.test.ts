import { describe, it, expect } from "vitest";
import { CONFIG_SCHEMA, CATEGORIES, type FieldDef } from "@/lib/configSchema";

const TYPES = ["text", "password", "int", "float", "bool", "enum", "world"];

describe("CONFIG_SCHEMA", () => {
  it("hat für jede Property vollständige, valide Metadaten", () => {
    for (const f of CONFIG_SCHEMA) {
      expect(f.name, `name fehlt`).toBeTruthy();
      expect(f.label, `label fehlt bei ${f.name}`).toBeTruthy();
      expect(f.description, `description fehlt bei ${f.name}`).toBeTruthy();
      expect(TYPES, `ungültiger type bei ${f.name}`).toContain(f.type);
      expect(CATEGORIES, `unbekannte category bei ${f.name}`).toContain(f.category);
      expect(typeof f.default, `default fehlt bei ${f.name}`).toBe("string");
    }
  });

  it("keine doppelten Property-Namen", () => {
    const names = CONFIG_SCHEMA.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("enum-Felder haben nicht-leere Optionen", () => {
    for (const f of CONFIG_SCHEMA.filter((f) => f.type === "enum")) {
      expect(f.options && f.options.length > 0, `options fehlen bei ${f.name}`).toBe(true);
    }
  });

  it("Slider-Felder haben min und max", () => {
    for (const f of CONFIG_SCHEMA.filter((f) => f.slider)) {
      expect(typeof f.min, `min fehlt bei Slider ${f.name}`).toBe("number");
      expect(typeof f.max, `max fehlt bei Slider ${f.name}`).toBe("number");
    }
  });

  it("deckt die wichtigsten V2.6-Properties typgerecht ab", () => {
    const by = (n: string): FieldDef | undefined => CONFIG_SCHEMA.find((f) => f.name === n);
    expect(by("ServerName")?.type).toBe("text");
    expect(by("ServerPassword")?.type).toBe("password");
    expect(by("GameWorld")?.type).toBe("world");
    expect(by("GameDifficulty")?.type).toBe("enum");
    expect(by("EACEnabled")?.type).toBe("bool");
    expect(by("XPMultiplier")?.type).toBe("int");
    expect(by("ZombieMove")?.options?.length).toBe(5);
    // breite Abdeckung
    expect(CONFIG_SCHEMA.length).toBeGreaterThanOrEqual(60);
  });
});
