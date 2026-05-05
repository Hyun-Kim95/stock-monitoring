# 분봉이 ‘어제가 오늘·지금 시각’처럼 보일 때 원인 파악

코드에는 **최근 날짜만 골라 오늘 날짜로 붙이는** 차트 로더가 없다.  
[`apps/api/src/modules/history/quote-history.ts`](../../apps/api/src/modules/history/quote-history.ts)는 `recorded_at`을 KST 벽시계로 바꾼 뒤 분 버킷으로 `GROUP BY` 하며, `bucketRaTs <= bucketNowTs`는 **미래 분**만 제외한다.

아래 순서로 **API 응답 시각**과 **WS 머지**를 가르면 원인을 단정할 수 있다.

## 1) 네트워크: 분봉 chart API의 `candles[].t`

1. 브라우저 개발자 도구 → **Network**.
2. 분봉 선택 후 `GET /stocks/{stockUuid}/chart?granularity=minute&range=normal&session=all&minuteFrame=1` (쿼리는 화면과 동일하게) 응답 JSON을 연다.
3. **`candles` 배열 마지막 3~5개의 `t`**(ISO 문자열)를 복사한다.
4. 각 `t`를 KST로 변환했을 때 **날짜·시각이 기대(전일 장 마감분 vs 오늘 현재분)**와 맞는지 본다.

| 관측 | 의미 |
|------|------|
| 마지막 `t`가 **어제 KST 장중**에 해당 | 집계/DB 쪽 **B 또는 C** (아래 3)으로 더 조사 |
| 마지막 `t`가 **오늘 KST ‘지금 분’**에 가깝고, OHLC가 전일 종가에 가깝다 | **A: WS + `mergeLiveMinuteBar`** (세션 `OPEN`/`PRE`일 때만 머지). API는 오늘 분이 맞고 가격만 스테일 |

## 2) WebSocket: `quote_update` / `snapshot`

동시에 WS 메시지에서 해당 종목의:

- `marketSession` (`OPEN` / `PRE` / `CLOSED` / …)
- `price`, `timestamp`

을 확인한다. **화면의 ‘세션’ 표시와 WS payload가 같은지**도 본다.

## 3) DB 샘플(선택)

루트에서( `DATABASE_URL` 필요 ):

```bash
node scripts/db/inspect-minute-period-kst.mjs 005930
```

종목코드만 바꾼다. 출력:

- 최근 `recorded_at`(UTC 저장)·`price`
- 동일 행에 대해 **집계와 동일한 KST 분 버킷 시작(`period_kst`)** 계산값

`recorded_at`과 `period_kst`의 KST 날짜가 어긋나면 **C(저장/시각)** 쪽을 의심한다.

## 4) PostgreSQL `date_trunc` 참고

`date_trunc('minute', timestamptz AT TIME ZONE 'Asia/Seoul')`는 입력이 **`timestamp without time zone`**이므로, 문서상 **“at face value”**로 잘린다(세션 `TimeZone`으로 해석을 바꾸지 않음).  
즉 **이 경로만으로 ‘하루 밀림’을 설명하기는 어렵다**가 코드 리뷰 결론이다. 의심이 남으면 DB에서 `SHOW TIME ZONE;`과 스크립트 출력을 함께 남긴다.

## 5) 결론 매트릭스(증거 후 패치 범위)

| 단정 | 후속 |
|------|------|
| **A** (API `t`는 오늘 분인데 봉이 전일가처럼 보임 + WS `OPEN`/`PRE`) | 서버 `marketSession`·휴장 캘린더·클라 `mergeLiveMinuteBar`/분봉 폴링 가드(이미 적용된 방향) 유지·회귀 |
| **B** (API `t` 자체가 어제로 잘못됨) | [`quote-history.ts`](../../apps/api/src/modules/history/quote-history.ts) `period` SQL을 `date_trunc(..., timestamptz, 'Asia/Seoul')` 등으로 더 명시적으로 정리하는 패치 검토 |
| **C** (`recorded_at`과 집계 `period_kst` 불일치) | 시세 기록 경로·서버 시계·DB 타입·Prisma 매핑 점검 |

수동 캡처(1)(2)와 스크립트(3) 결과를 붙이면 이슈에 **원인 한 줄(A/B/C)**로 닫을 수 있다.

## 6) 휴장일인데 분 버킷이 보일 때(대응)

- **읽기**: 분봉 집계 후, 봉 시각이 속한 KST 날짜가 `isKrxScheduledFullDayClosureKstYmd`이면 캔들에서 제외한다([`quote-history.ts`](../../apps/api/src/modules/history/quote-history.ts)).
- **쓰기**: KIS 당일 분봉 백필은 KST 전일 휴장이면 실행하지 않는다([`kis-chart-backfill.ts`](../../apps/api/src/modules/history/kis-chart-backfill.ts)).
- **이미 DB에 쌓인 휴장일 틱**은 위 필터로 차트에서 숨기고, 물리 삭제는 `npm run db:delete-quote-history-kst -- 20260505 --execute` 형태로 별도 정리한다.
