import { describe, it, expect } from "vitest";
import { parseCronSchedule } from "@/lib/schedule";

describe("parseCronSchedule", () => {
  it("erkennt täglichen Job um 20:00", () => {
    expect(parseCronSchedule("0 20 * * *")).toEqual({ hour: 20, minute: 0 });
  });
  it("erkennt Job um 8:30", () => {
    expect(parseCronSchedule("30 8 * * *")).toEqual({ hour: 8, minute: 30 });
  });
  it("gibt null für komplexe Expressions zurück", () => {
    expect(parseCronSchedule("0 */6 * * *")).toBeNull();
  });
});
