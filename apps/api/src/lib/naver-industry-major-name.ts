/**
 * DB의 industry_major_code는 네이버 모바일 시세 integration의 industryCode(업종 번호)와 동일합니다.
 * 업종 한글명은 금융 업종 상세 페이지 <title>에 EUC-KR로 들어 있습니다.
 */
const cache = new Map<string, string | null>();

function isUpjongNo(raw: string): boolean {
  return /^\d{1,5}$/.test(raw.trim());
}

/** 업종 원문을 테마/화면에 읽기 쉬운 형태로 정규화 */
export function normalizeIndustryMajorLabel(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/,/g, "·")
    .replace(/([가-힣A-Za-z0-9])(?:와|과|및)([가-힣A-Za-z0-9])/g, "$1·$2")
    .replace(/·{2,}/g, "·")
    .replace(/^\.+|\.+$/g, "");
}

export async function getNaverIndustryMajorName(industryMajorCode: string): Promise<string | null> {
  const code = industryMajorCode.trim();
  if (!code || !isUpjongNo(code)) return null;
  const hit = cache.get(code);
  if (hit !== undefined) return hit;

  const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "stock-monitoring/1.0 (industry label resolver)",
      },
    });
    if (!res.ok) {
      cache.set(code, null);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const html = new TextDecoder("euc-kr").decode(buf);
    const open = html.indexOf("<title>");
    const close = html.indexOf("</title>");
    if (open === -1 || close === -1 || close <= open) {
      cache.set(code, null);
      return null;
    }
    const title = html.slice(open + 7, close).trim();
    const name = normalizeIndustryMajorLabel(title.split(":")[0]?.trim() ?? "");
    if (!name || /오류|error|not found|404/i.test(name)) {
      cache.set(code, null);
      return null;
    }
    cache.set(code, name);
    return name;
  } catch {
    cache.set(code, null);
    return null;
  }
}

export async function getNaverIndustryMajorNames(codes: Iterable<string | null | undefined>): Promise<Map<string, string | null>> {
  const unique = [...new Set([...codes].map((c) => (c ?? "").trim()).filter((c) => c.length > 0))];
  const out = new Map<string, string | null>();
  await Promise.all(
    unique.map(async (c) => {
      const name = await getNaverIndustryMajorName(c);
      out.set(c, name);
    }),
  );
  return out;
}
