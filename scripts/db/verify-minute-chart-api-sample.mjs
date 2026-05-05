/**
 * 로컬 API 분봉 chart 마지막 봉 `t`·OHLC + (가능 시) WS snapshot 동일 종목 시세를 출력한다.
 * 원인 A(API `t`는 오늘 분인데 가격만 스테일) vs B/C(`t` 자체가 어제) 가름용.
 *
 * 사용: 루트에서 `node scripts/db/verify-minute-chart-api-sample.mjs 005930`
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env") });

let code = (process.argv[2] ?? "005930").replace(/\D/g, "");
while (code.length > 0 && code.length < 6) code = `0${code}`;
if (code.length > 6) code = code.slice(-6);

const prisma = new PrismaClient();
const baseHttp = process.env.API_CHART_BASE_URL?.trim() || "http://127.0.0.1:4000";
const baseWs = process.env.API_WS_BASE_URL?.trim() || "ws://127.0.0.1:4000";

function wsSnapshotForCode(codeArg) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === "undefined") {
      resolve(null);
      return;
    }
    const ws = new WebSocket(`${baseWs}/ws/quotes`);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* */
      }
      resolve(null);
    }, 4000);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "snapshot" && Array.isArray(msg.quotes)) {
          const q = msg.quotes.find((x) => x.symbol === codeArg);
          clearTimeout(timer);
          try {
            ws.close();
          } catch {
            /* */
          }
          resolve(q ?? null);
        }
      } catch {
        /* */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
  });
}

try {
  const s = await prisma.stock.findFirst({ where: { code }, select: { id: true, code: true, name: true } });
  if (!s) {
    console.error("stock not found:", code);
    process.exit(1);
  }
  const url = `${baseHttp}/stocks/${s.id}/chart?granularity=minute&range=normal&session=all&minuteFrame=1`;
  const res = await fetch(url);
  const j = await res.json();
  if (!res.ok) {
    console.error("HTTP", res.status, j);
    process.exit(1);
  }
  const candles = j.candles ?? [];
  const tail = candles.slice(-5);
  console.info("stock", s.code, s.name);
  console.info("GET", url);
  console.info("candle count", candles.length);
  console.info("last 5 (t, open, high, low, close):");
  for (const c of tail) {
    console.info(
      JSON.stringify({
        t: c.t,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }),
    );
  }
  const last = candles.at(-1);
  if (last?.t) {
    const d = new Date(last.t);
    const kst = d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false });
    console.info("last.t as KST (wall clock):", kst);
  }

  const snap = await wsSnapshotForCode(s.code);
  if (snap) {
    console.info("WS snapshot quote for same code:", {
      symbol: snap.symbol,
      price: snap.price,
      marketSession: snap.marketSession,
      timestamp: snap.timestamp,
    });
    if (last && Number.isFinite(last.close) && Number.isFinite(snap.price)) {
      const diff = Math.abs(Number(last.close) - Number(snap.price));
      console.info("abs(last.close - ws.price):", diff);
    }
  } else {
    console.info("WS snapshot: skipped (no WebSocket in this runtime or timeout)");
  }
} finally {
  await prisma.$disconnect();
}
