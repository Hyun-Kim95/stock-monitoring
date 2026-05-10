/** OAuth 로그인 후 `next` — 동일 출처 상대 경로만 허용 (오픈 리다이렉트 완화) */
const MAX_NEXT_LEN = 2048;

export function normalizeSafeRelativeNext(raw: string | undefined): string {
  if (raw == null || typeof raw !== "string") return "/";
  let s = raw.trim();
  if (s.length === 0 || s.length > MAX_NEXT_LEN) return "/";

  try {
    let decoded = s;
    for (let i = 0; i < 3; i++) {
      const nextDecode = decodeURIComponent(decoded);
      if (nextDecode === decoded) break;
      decoded = nextDecode;
    }
    s = decoded;
  } catch {
    return "/";
  }

  if (!s.startsWith("/")) return "/";
  if (s.startsWith("//")) return "/";
  if (s.includes("\\")) return "/";

  const qIdx = s.indexOf("?");
  const hIdx = s.indexOf("#");
  let pathEnd = s.length;
  if (qIdx >= 0) pathEnd = Math.min(pathEnd, qIdx);
  if (hIdx >= 0) pathEnd = Math.min(pathEnd, hIdx);
  const pathOnly = s.slice(0, pathEnd);

  if (pathOnly.includes("//")) return "/";

  const segments = pathOnly.split("/").filter(Boolean);
  for (const seg of segments) {
    if (seg === "." || seg === "..") return "/";
  }

  return s;
}
