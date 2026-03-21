# Phase 0 — 운영·외부 연동 (초안)

실제 **시세·뉴스 API 확정 전**에도 개발을 진행할 수 있도록, 현재 레포 기준 잠정 합의와 후보를 정리합니다.

**합의·개정은 `docs/DECISION_LOG.md`가 단일 소스입니다.** 이 파일은 요약·맥락용입니다.

## 실시간 시세 (0.1)

| 후보 유형 | 메모 |
|-----------|------|
| 증권사 Open API (예: 한국투자증권 KIS) | 실시간·WebSocket 여부는 상품/권한별 상이. 약관·호출 한도·상업 이용 확인 필요. |
| 기타 공식/유료 데이터 벤더 | 필드 스키마가 PRD `QuoteSnapshot`과 다를 수 있음 → 어댑터에서 정규화. |

- **현재 구현:** `market_data.provider = mock` 목 프로바이더. 인터페이스는 `MarketDataProvider` (`apps/api/src/modules/market-data/types.ts`).
- **재연결:** `nextReconnectDelayMs()` (`reconnect.ts`) — 외부 WS 끊김 시 지수 백오프+지터에 사용.

## 뉴스 (0.2)

- **현재 구현:** 목 피드 + `NewsSourceRule` 기반 include/exclude, URL 중복 제거, `news.fetch_interval_ms` TTL 메모리 캐시.
- **확정 시 할 일:** 포털/검색 API 약관·한도·인증, 노이즈 샘플, 중복 기준(URL 우선 등) 운영 확정.

## 관리자·보안 (0.3, MVP)

- **현재:** `ADMIN_API_TOKEN` 설정 시 `Authorization: Bearer` 필수. 미설정 시 로컬에서 인증 생략.
- **쓰기 요청:** IP당 분당 120회 제한(간이, `write-rate-limit.ts`).
- **운영 확정 필요:** 리버스 프록시(Basic Auth/IP 제한), 키 암호화 저장 여부.

## 규모·SLA (0.4)

| 항목 | 잠정 값 |
|------|---------|
| 관심종목 상한 | **D-005:** 설계 50 / 하드 상한 100 — `stocks.max_active` (`system_settings`) |
| 초단위 | 목: 1s 틱; 브로드캐스트는 `realtime.broadcast_throttle_ms`(기본 250ms) |

이 문서는 API가 확정되면 후보 표를 벤더별 비교표로 대체하면 됩니다.
