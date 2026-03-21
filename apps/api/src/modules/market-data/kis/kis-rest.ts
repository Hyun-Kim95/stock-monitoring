/** 한국투자증권 REST (국내주식 현재가 시세). 공식 샘플: open-trading-api inquire_price */

export type KisTokenResponse = {
  access_token: string;
  access_token_token_expired: string;
};

export async function fetchKisAccessToken(
  baseUrl: string,
  appKey: string,
  appSecret: string,
): Promise<KisTokenResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/oauth2/tokenP`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KIS token HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as KisTokenResponse;
  if (!json.access_token) {
    throw new Error(`KIS token 응답에 access_token 없음: ${text.slice(0, 200)}`);
  }
  return json;
}

export type KisInquirePriceOutput = Record<string, string | undefined>;

export type KisInquirePriceBody = {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: KisInquirePriceOutput;
};

/** TR_ID: FHKST01010100 (공식 샘플 — 실전/모의 동일, 도메인만 구분) */
export async function fetchKisInquirePrice(
  baseUrl: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
  stockCode: string,
  trId: string,
): Promise<KisInquirePriceOutput> {
  const path = "/uapi/domestic-stock/v1/quotations/inquire-price";
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", stockCode);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
      custtype: "P",
      tr_cont: "",
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KIS inquire-price HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as KisInquirePriceBody;
  if (json.rt_cd && json.rt_cd !== "0") {
    throw new Error(`KIS inquire-price ${json.msg_cd ?? ""}: ${json.msg1 ?? text.slice(0, 200)}`);
  }
  if (!json.output || typeof json.output !== "object") {
    throw new Error(`KIS inquire-price output 없음: ${text.slice(0, 200)}`);
  }
  return json.output;
}

export function parseKisNumber(v: string | undefined): number {
  if (v == null || v === "") return NaN;
  const n = Number(String(v).replace(/,/g, ""));
  return n;
}

/**
 * 전일대비(원)·등락률(%): 값 문자열에 `+`/`-`가 없으면 `prdy_vrss_sign`으로 부호를 붙입니다.
 * KIS 출력속성: 1 상한, 2 상승, 3 보합, 4 하한, 5 하락.
 */
export function parseKisSignedFluctuation(
  valueStr: string | undefined,
  signStr: string | undefined,
): number {
  const raw = String(valueStr ?? "").trim();
  if (raw === "") return NaN;
  const normalized = raw.replace(/,/g, "");
  if (/^[+-]/.test(normalized)) {
    return Number(normalized);
  }
  const n = Number(normalized);
  if (Number.isNaN(n)) return NaN;
  const sign = String(signStr ?? "").trim();
  if (sign === "4" || sign === "5") return -Math.abs(n);
  if (sign === "1" || sign === "2") return Math.abs(n);
  return n;
}
