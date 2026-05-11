---
type: doc
project: stockMonitoring
doc_lane: design
updated_at: 2026-05-10
tags: [settings-ui, stitch, cli, option-b]
related_prd: ../requirements/settings-ui-prd.md
---

# 안 B — Stitch 기반 디자인 (CLI 작업)

본 프로젝트에서는 Stitch를 **Cursor MCP가 아니라 CLI**로만 다룬다.  
품질 기준(상태 UI·다크모드·반응형)은 [`stitch-sop.md`](./stitch-sop.md)와 **동일 러브릭**을 따른다.

## 1. 전제

- Stitch/Google 계정·API 키 또는 OAuth 등 **CLI 도구가 요구하는 인증**을 로컬에 설정한다.
- 설치된 CLI의 **실제 패키지 이름·서브커맨드**는 배포판마다 다를 수 있다. 아래는 **작업 순서 템플릿**이며, 명령은 `stitch --help` / 공식 README를 SSOT로 한다.

## 2. 표준 작업 순서 (SOP — CLI 매핑)

[`stitch-sop.md`](./stitch-sop.md)의 MCP 단계를 CLI 관점으로 옮긴 것이다.

| 단계 | Stitch SOP (개념) | CLI에서 할 일 |
|------|-------------------|----------------|
| 0 | 프로젝트 확인/생성 | CLI의 `project create` / `project list` 등으로 **설정 UI 전용 Stitch 프로젝트** 생성 |
| 1 | 디자인 시스템 | `design-system create` 또는 동등 명령으로 **라이트·다크**, 폰트, 라운드, 브랜드 컬러 고정 |
| 2 | 화면 생성 | **프롬프트**(§4)로 화면별 생성 — `MOBILE` / `DESKTOP` 각각 또는 반응형 한 번에 |
| 3 | 변형·수정 | `variants` / `edit` 계열로 대안 2~3개 탐색 |
| 4 | 확정·내보내기 | 스크린샷·HTML·Figma 등 CLI가 제공하는 **내보내기**로 저장 |

## 3. 반드시 넣을 프롬프트 공통 블록

[`stitch-sop.md`](./stitch-sop.md) 템플릿에 다음을 **설정 UI 도메인**으로 채운다.

```text
목표: 국내 주식 모니터링 서비스의 설정 UI(`/settings/*`) — 종목/테마/뉴스 규칙/런타임 설정 운영
사용자: 테넌트 OWNER·ADMIN (세션 로그인)
플랫폼: web desktop 우선, 좁은 창에서 사이드바 축소 또는 햄버거
필수 상태: 기본, 로딩, 빈 데이터, 오류(409 상한·502 검색·403 CSRF), 권한(MEMBER는 진입 불가)
핵심 컴포넌트: 사이드 네비, 패널, 데이터 테이블, 폼, 필터·검색, 배지(활성 n/최대 m)
스타일: 기존 대시보드와 톤 정렬, 다크모드 필수, 접근성 대비
제약: 과도한 장식 금지, 표 가독성·키보드 포커스
```

## 4. 화면별 프롬프트 초안 (복붙 후 CLI에 전달)

각 블록을 한 번에 또는 화면마다 `generate` 로 실행한다.

### 4.1 셸 + 종목 관리

```text
레이아웃: 왼쪽 고정 사이드바(로고·이메일·메뉴: 종목·테마·뉴스 규칙·런타임 설정·로그아웃),
오른쪽 메인: 제목 "종목 관리", 요약 "활성 n / 최대 m",
상단 패널: 종목 검색·외부 검색 결과 리스트·등록 폼(코드·이름·시장·업종·별칭·테마),
하단 패널: 종목 테이블(상태·코드·이름·시장·별칭·산업·행동 버튼).
상태: 로딩 스켈레톤, 빈 목록, 오류 배너, 409 상한 초과 모달 문구.
데스크톱 너비 1200px 기준 와이어.
```

### 4.2 테마 관리

```text
테마 목록 + 테마별 소속 종목 멀티 선택(검색 필터, 체크박스), 새 테마 인라인 폼.
빈 테마·저장 성공·409 중복 상태.
```

### 4.3 뉴스 규칙

```text
규칙 테이블: 스코프 GLOBAL|STOCK, 종목 선택, 포함/제외 키워드, 우선순위, 활성.
폼에서 GLOBAL일 때 stockId 비움, STOCK일 때 필수 — 오류 상태 시 필드 하이라이트.
```

### 4.4 런타임 설정

```text
키·값·수정일 표, 행 선택 후 하단에서 값만 편집. 읽기 전용 키 필드.
```

## 5. 레포에 포함된 SDK 실행 (Node · 공식 `@google/stitch-sdk`)

터미널에서 **동일한 MCP 백엔드**에 연결하는 공식 SDK를 쓴다(키 필요).

1. 루트 `.env`에 `STITCH_API_KEY=` 설정 ([설명](https://github.com/google-labs-code/stitch-sdk#configuration)).
2. (선택) 기존 Stitch 프로젝트 ID가 있으면 `STITCH_PROJECT_ID=` — 없으면 계정의 **첫 프로젝트**를 사용한다.
3. 실행:

```bash
npm run stitch:settings-ui
```

4. 결과 URL이 `docs/design/artifacts/stitch-output/run-summary.md`에 기록된다.

의존성: 루트 `devDependencies`의 `@google/stitch-sdk`.

## 6. 산출물 저장 위치

- SDK 실행 로그: `docs/design/artifacts/stitch-output/run-summary.md`
- 기타 바이너리·스크린샷 로컬 저장 시 팀 정책에 따라 `.gitignore` 또는 외부 스토리지 링크만 문서에 남김

## 7. 확정 시 기록할 필드 (비교표·PRD 동기화)

[`settings-ui-design-comparison.md`](./settings-ui-design-comparison.md) 및 필요 시 PRD에 다음을 남긴다.

- CLI **프로젝트 ID**
- 디자인 시스템 **asset / ID**
- 확정 **화면 ID**·프롬프트 최종본
- 데스크톱/모바일 여부

## 8. MCP와의 관계

로컬 규칙상 **에이전트는 Stitch MCP 대신 CLI만 사용**한다.  
[`stitch-sop.md`](./stitch-sop.md)의 MCP 호출 순서는 **품질 체크리스트**로만 참고하고, 실제 호출은 CLI 도구 문서를 따른다.
