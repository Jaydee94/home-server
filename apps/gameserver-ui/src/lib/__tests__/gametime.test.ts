import { describe, it, expect } from "vitest";
import { parseGetTime, nextBloodMoon } from "../gametime";

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
