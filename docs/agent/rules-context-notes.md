# Rules context notes

`.cursor/rules/`의 규칙 다수가 `alwaysApply: true`로 로드될 수 있다. 공통 전역 원칙(`00/15/55/65/75`)은 User-level에 두고, 이 폴더에는 프로젝트 로컬 규칙만 유지한다.

## 한 줄 요약 (파일 → 목적)

| 파일 | 한 줄 목적 |
|------|------------|
| `User-level: # product-ui-core-global` | 모바일 우선·상태 UI·접근성 기본 |
| `20-web-vs-app.mdc` | 웹은 테이블/명시 탐색, 앱은 스크롤·리스트 |
| `30-table-pagination.mdc` | 테이블 화면: 필터·15건·하단 페이지네이션 |
| `40-dark-mode.mdc` | 다크/라이트·토큰·대비·전환 유지 |
| `50-index-css-contract.mdc` | 전역 스타일 기준 파일·Stitch 등 합의 |
| `60-delivery-gates.mdc` | Gate 1~3, 병렬 조건, DoD |
| `64-context-organization.mdc` | 맥락 정리(3단) 러브릭; Gate/적용·HUMAN 권한은 60/70, 상세는 스킬 |
| `70-client-lifecycle-default.mdc` | 고객 프로젝트 전체 대화 시 스킬 적용·디자인 승인 시 구현 착수 승인 통합 |
| `User-level: # emergent-rule-capture-global` | 작업 중 생긴 규칙을 후보로 수집하고 승인 후 SSOT에 반영 |
| `docs/agent/delivery-loop-harness.md` | 고객 프로젝트 단계 3 이후 선택: 상태 JSON·훅 가드·테스트 루프 |

총괄 오케스트레이션과 **직접 처리 가능한 예외** 목록(SSOT)은 저장소 루트의 `AGENTS.md`를 본다.
