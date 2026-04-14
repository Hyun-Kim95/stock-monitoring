/**
 * 종목 공식명 변경 시, 구 공식명을 뉴스 검색(`searchAlias`)에 남겨
 * 제목에 구명만 있는 기사도 잡을 수 있게 한다.
 */
function segmentDedupeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export function mergeFormerOfficialNameIntoSearchAlias(params: {
  priorOfficialName: string;
  /** 클라이언트가 보낸 별칭 또는 DB 기존값 */
  baseSearchAlias: string | null;
  newOfficialName: string;
}): string | null {
  const prior = params.priorOfficialName.trim();
  const neu = params.newOfficialName.trim();
  if (!prior || prior === neu) {
    const b = params.baseSearchAlias?.trim();
    return b && b.length > 0 ? params.baseSearchAlias!.trim() : null;
  }
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const k = segmentDedupeKey(t);
    if (seen.has(k)) return;
    seen.add(k);
    parts.push(t);
  };
  if (params.baseSearchAlias) {
    for (const a of params.baseSearchAlias.split(/[,，]/)) {
      push(a);
    }
  }
  const priorK = segmentDedupeKey(prior);
  if (!seen.has(priorK)) push(prior);
  return parts.length > 0 ? parts.join(", ") : null;
}
