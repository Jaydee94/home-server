import { describe, it, expect } from "vitest";
import { parseGetTime, nextBloodMoon, bloodMoonLabel } from "../gametime";

describe("parseGetTime", () => {
  it("parses 'Day 7, 08:30'", () => {
    expect(parseGetTime("Day 7, 08:30")).toEqual({ day: 7, hour: 8, minute: 30 });
  });
  it("returns null on garbage", () => {
    expect(parseGetTime("nope")).toBeNull();
  });
});

describe("nextBloodMoon", () => {
  it("returns the current day when it is a blood moon day", () => {
    expect(nextBloodMoon(7, 7)).toBe(7);
    expect(nextBloodMoon(14, 7)).toBe(14);
  });
  it("returns the next multiple otherwise", () => {
    expect(nextBloodMoon(5, 7)).toBe(7);
    expect(nextBloodMoon(8, 7)).toBe(14);
  });
});

describe("bloodMoonLabel", () => {
  it("gibt null zurück, wenn keine Zeit verfügbar ist (z. B. direkt nach Neustart)", () => {
    expect(bloodMoonLabel(null, 7)).toBeNull();
  });
  it("meldet 'Heute Nacht!' am Blutmond-Tag", () => {
    expect(bloodMoonLabel({ day: 7, hour: 12, minute: 0 }, 7)).toBe("Heute Nacht!");
  });
  it("zählt sonst die Tage bis zum nächsten Blutmond", () => {
    expect(bloodMoonLabel({ day: 5, hour: 8, minute: 0 }, 7)).toBe("Tag 7 (in 2)");
  });
});
