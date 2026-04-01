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
  marketDiv: "J" | "NX" = "J",
): Promise<KisInquirePriceOutput> {
  const path = "/uapi/domestic-stock/v1/quotations/inquire-price";
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketDiv);
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

export type KisInvestorTrendBody = {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: Array<Record<string, string | undefined>>;
};

/** 투자자별 매매동향(일자별). TR_ID: FHKST01010900 */
export async function fetchKisInvestorTrend(
  baseUrl: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
  stockCode: string,
  marketDiv: "J" | "NX" = "J",
): Promise<Array<Record<string, string | undefined>>> {
  const path = "/uapi/domestic-stock/v1/quotations/inquire-investor";
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketDiv);
  url.searchParams.set("FID_INPUT_ISCD", stockCode);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: "FHKST01010900",
      custtype: "P",
      tr_cont: "",
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KIS investor-trend HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as KisInvestorTrendBody;
  if (json.rt_cd && json.rt_cd !== "0") {
    throw new Error(`KIS investor-trend ${json.msg_cd ?? ""}: ${json.msg1 ?? text.slice(0, 200)}`);
  }
  return Array.isArray(json.output) ? json.output : [];
}

/**
 * 전일대비(원)·등락률(%): 값 문자열에 `+`/`-`가 없으면 `prdy_vrss_sign`으로 부호를 붙입니다.
 * KIS 출력속성: 1 상한, 2 상승, 3 보합, 4 하한, 5 하락.
 */
export type KisDailyChartBody = {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output1?: unknown;
  output2?: Record<string, string | undefined>[];
};

const TR_ID_DAILY_ITEM_CHART = "FHKST03010100";
const TR_ID_TIME_ITEM_CHART = "FHKST03010200";

export type KisTimeChartBody = {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output1?: Record<string, string | undefined>;
  output2?: Record<string, string | undefined>[];
};

/** 당일 분봉 조회 (최대 30건/호출) */
export async function fetchKisTimeItemChartPrice(
  baseUrl: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
  stockCode: string,
  marketDiv: "J" | "NX",
  inputHour1: string,
): Promise<Record<string, string | undefined>[]> {
  const path = "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice";
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketDiv);
  url.searchParams.set("FID_INPUT_ISCD", stockCode);
  url.searchParams.set("FID_INPUT_HOUR_1", inputHour1);
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");
  url.searchParams.set("FID_ETC_CLS_CODE", "");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: TR_ID_TIME_ITEM_CHART,
      custtype: "P",
      tr_cont: "",
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KIS time-chart HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as KisTimeChartBody;
  if (json.rt_cd && json.rt_cd !== "0") {
    throw new Error(`KIS time-chart ${json.msg_cd ?? ""}: ${json.msg1 ?? text.slice(0, 200)}`);
  }
  return Array.isArray(json.output2) ? json.output2 : [];
}

/**
 * 국내주식 일/주/월/년 봉 차트 (output2 배열).
 * TR_ID: FHKST03010100 — 실전·모의 동일, 도메인만 구분.
 * 100건 초과 시 응답 헤더 `tr_cont` / `tr_cont_key`로 연속 조회.
 */
export async function fetchKisDailyItemChartPricePage(
  baseUrl: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
  stockCode: string,
  fidInputDate1: string,
  fidInputDate2: string,
  periodDiv: "D" | "W" | "M" | "Y",
  orgAdjPrc: "0" | "1",
  trCont: string,
  trContKey: string,
): Promise<{
  rows: Record<string, string | undefined>[];
  trContOut: string | null;
  trContKeyOut: string | null;
}> {
  const path = "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice";
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", stockCode);
  url.searchParams.set("FID_INPUT_DATE_1", fidInputDate1);
  url.searchParams.set("FID_INPUT_DATE_2", fidInputDate2);
  url.searchParams.set("FID_PERIOD_DIV_CODE", periodDiv);
  url.searchParams.set("FID_ORG_ADJ_PRC", orgAdjPrc);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: TR_ID_DAILY_ITEM_CHART,
      custtype: "P",
      tr_cont: trCont,
      tr_cont_key: trContKey,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KIS daily-chart HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as KisDailyChartBody;
  if (json.rt_cd && json.rt_cd !== "0") {
    throw new Error(`KIS daily-chart ${json.msg_cd ?? ""}: ${json.msg1 ?? text.slice(0, 200)}`);
  }
  const raw = Array.isArray(json.output2) ? json.output2 : [];
  const trContOut = res.headers.get("tr_cont");
  const trContKeyOut = res.headers.get("tr_cont_key");
  return {
    rows: raw,
    trContOut: trContOut?.trim() || null,
    trContKeyOut: trContKeyOut?.trim() || null,
  };
}

/** 연속 조회로 output2를 최대 maxRows까지 모읍니다. */
export async function fetchKisDailyItemChartPriceAll(
  baseUrl: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
  stockCode: string,
  fidInputDate1: string,
  fidInputDate2: string,
  periodDiv: "D" | "W" | "M" | "Y",
  orgAdjPrc: "0" | "1",
  opts: { maxRows: number; pageGapMs: number },
): Promise<Record<string, string | undefined>[]> {
  const merged: Record<string, string | undefined>[] = [];
  let trCont = "";
  let trContKey = "";
  for (let page = 0; page < 40 && merged.length < opts.maxRows; page++) {
    const { rows, trContOut, trContKeyOut } = await fetchKisDailyItemChartPricePage(
      baseUrl,
      accessToken,
      appKey,
      appSecret,
      stockCode,
      fidInputDate1,
      fidInputDate2,
      periodDiv,
      orgAdjPrc,
      trCont,
      trContKey,
    );
    merged.push(...rows);
    const more = trContOut === "M" || trContOut === "F";
    if (!more || !trContKeyOut) break;
    trCont = "N";
    trContKey = trContKeyOut;
    if (opts.pageGapMs > 0) {
      await new Promise((r) => setTimeout(r, opts.pageGapMs));
    }
  }
  return merged.slice(0, opts.maxRows);
}

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
