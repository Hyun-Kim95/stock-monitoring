import { describe, expect, it } from "vitest";
import { parseKisSignedFluctuation } from "./kis-rest.js";

describe("parseKisSignedFluctuation", () => {
  it("문자열에 부호가 있으면 그대로", () => {
    expect(parseKisSignedFluctuation("-1,200.5", "2")).toBe(-1200.5);
    expect(parseKisSignedFluctuation("+2.18", "5")).toBe(2.18);
  });
  it("부호 없이 하락(5)이면 음수", () => {
    expect(parseKisSignedFluctuation("1200", "5")).toBe(-1200);
    expect(parseKisSignedFluctuation("2.18", "5")).toBe(-2.18);
  });
  it("부호 없이 상승(2)이면 양수", () => {
    expect(parseKisSignedFluctuation("1200", "2")).toBe(1200);
  });
  it("보합(3) 등은 절댓값 그대로(보통 0)", () => {
    expect(parseKisSignedFluctuation("0", "3")).toBe(0);
  });
});
