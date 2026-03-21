import { describe, expect, it } from "vitest";
import { nextReconnectDelayMs } from "./reconnect.js";

describe("nextReconnectDelayMs", () => {
  it("시도가 늘수록 지연 증가(상한 내)", () => {
    const a0 = nextReconnectDelayMs(0, { baseMs: 1000, maxMs: 10_000 });
    const a2 = nextReconnectDelayMs(2, { baseMs: 1000, maxMs: 10_000 });
    expect(a2).toBeGreaterThanOrEqual(a0);
    expect(a0).toBeLessThanOrEqual(10_000);
    expect(a2).toBeLessThanOrEqual(10_000 + 3000);
  });
});
