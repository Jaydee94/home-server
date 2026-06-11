import { describe, it, expect } from "vitest";
import { SessionTracker } from "../playersession";

describe("SessionTracker", () => {
  it("records first-seen time per id and reports it", () => {
    const t = new SessionTracker(() => 1000);
    t.seen(["a", "b"]);
    expect(t.since("a")).toBe(1000);
  });
  it("keeps the original first-seen across later polls", () => {
    let now = 1000;
    const t = new SessionTracker(() => now);
    t.seen(["a"]); now = 5000; t.seen(["a"]);
    expect(t.since("a")).toBe(1000);
  });
  it("forgets players that went offline", () => {
    const t = new SessionTracker(() => 1000);
    t.seen(["a"]); t.seen(["b"]);
    expect(t.since("a")).toBeNull();
  });
});
