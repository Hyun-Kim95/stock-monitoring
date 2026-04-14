import { describe, expect, it } from "vitest";
import { mergeFormerOfficialNameIntoSearchAlias } from "./stock-search-alias.js";
import { buildNaverNewsQuery } from "../modules/news/naver-news.js";

describe("mergeFormerOfficialNameIntoSearchAlias", () => {
  it("이름이 같으면 base만 정리해 반환", () => {
    expect(
      mergeFormerOfficialNameIntoSearchAlias({
        priorOfficialName: "삼성전자",
        baseSearchAlias: "SEC, 三星",
        newOfficialName: "삼성전자",
      }),
    ).toBe("SEC, 三星");
  });

  it("이름이 바뀌면 구명을 별칭에 합침", () => {
    expect(
      mergeFormerOfficialNameIntoSearchAlias({
        priorOfficialName: "옛이름",
        baseSearchAlias: "별칭1",
        newOfficialName: "신이름",
      }),
    ).toBe("별칭1, 옛이름");
  });

  it("base가 비어 있어도 구명만 저장", () => {
    expect(
      mergeFormerOfficialNameIntoSearchAlias({
        priorOfficialName: "옛이름",
        baseSearchAlias: null,
        newOfficialName: "신이름",
      }),
    ).toBe("옛이름");
  });

  it("이미 별칭에 구명이 있으면 중복 추가 안 함", () => {
    expect(
      mergeFormerOfficialNameIntoSearchAlias({
        priorOfficialName: "옛 이름",
        baseSearchAlias: "옛이름, 기타",
        newOfficialName: "신이름",
      }),
    ).toBe("옛이름, 기타");
  });
});

describe("buildNaverNewsQuery", () => {
  it("이름+병합 별칭이 200자를 넘으면 잘림", () => {
    const longAlias = "x".repeat(250);
    const q = buildNaverNewsQuery({ name: "A".repeat(30), searchAlias: longAlias });
    expect(q.length).toBeLessThanOrEqual(200);
  });
});
