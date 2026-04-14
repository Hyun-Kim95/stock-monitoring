# AGENTS

## 목적
이 프로젝트의 메인 에이전트는 요청을 분석하고, 적절한 Rules, Skills, Subagents를 선택해 작업을 진행한다.

이 파일은 총괄 오케스트레이션만 담당한다.
세부 정책은 `.cursor/rules/`, 작업 절차는 `.cursor/skills/`, 역할별 전문 범위는 `.cursor/agents/`에서 관리한다.

## 운영 원칙
- 항상 기존 프로젝트 구조와 기술 스택을 우선 존중한다.
- 작업 성격에 맞는 전문 서브에이전트가 있으면 우선 사용을 고려한다.
- 매우 작은 수정은 메인 에이전트가 직접 처리할 수 있다.
- 구현 후 검증과 문서화를 가능한 한 생략하지 않는다.
- 같은 내용을 Rules, Skills, Agents 파일에 중복 정의하지 않는다.
- 확실하지 않은 내용은 추정으로 단정하지 말고, 가정과 확인 필요사항을 명시한다.

## 역할 분담 기준
- UI, 반응형, 마크업, 화면 동작, 스타일, 접근성: `frontend-agent`
- API, DB, 서비스, 인증, 권한, 파일 처리: `backend-agent`
- 요구사항 정리, 정책 설계, 화면/기능 범위 정의: `prd-agent`
- 구현 결과 검증, 회귀 점검, 체크리스트 기반 확인: `qa-agent`
- 작업 내역 정리, 변경사항 문서화, README/인수인계: `docs-agent`
- 디자인 토큰, 테마, 다크모드, 컴포넌트 일관성: `design-system-agent`

## 게이트 기반 파이프라인
전역 기준은 `.cursor/rules/60-delivery-gates.mdc`를 따른다.

- **Gate 1**: PRD(또는 동등 문서), 목업·화면 스펙, API 계약 초안이 갖춰진 뒤 신규 기능 구현 착수.
- **Gate 2**: API 계약·상태 UI 정의가 확정된 뒤 프론트·백엔드 병렬 구현(`parallel-delivery`).
- **Gate 3**: DoD(아래) 충족 시 완료. `verify-change` 또는 `qa-agent`로 검증, `document-change`로 정리.

## 병렬 실행 원칙
- UI와 API가 모두 필요하면 Gate 2 이후 `parallel-delivery`를 고려한다.
- 계약(스키마·에러·상태 코드)이 바뀌면 `docs-agent`/`document-change`로 즉시 동기화한다.
- 정책·권한·핵심 UX가 불명확하면 병렬을 멈추고 `plan-feature`로 되돌린다.

## 완료 정의(DoD)
- 요구사항·문서·API 계약과 구현이 일치한다.
- 기본·로딩·빈·오류·권한 등 상태 처리가 반영되었다.
- 해당 시 웹/앱·반응형·다크모드를 점검했다.
- 회귀 위험을 검토했다.
- 변경 요약과 영향 범위를 남겼다.

## 기본 진입 규칙
- 고객사 **전체 납품** 대화는 사용자가 스킬 이름을 말하지 않아도 `.cursor/rules/70-client-lifecycle-default.mdc`에 따라 `client-project-lifecycle`을 따른다(PRD·디자인 등 HUMAN 구간에서 멈춤). 구현 이후 **다축 검증·리뷰어 GATE**는 해당 스킬 **단계 4B~4D(선택)** 및 `docs/qa/reviewer-gate-rubric.md`를 참고한다.
- 고객사 신규 프로젝트를 **요구 붙여넣기 → PRD 승인 → 이중 목업 → 디자인 선택 → 병렬 구현 → 테스트·성능** 순으로 끝까지 진행하려면 `client-project-lifecycle`을 우선 고려한다.
- 신규 기능 요청이면 `start-feature`를 우선 고려한다. (Gate 1 통과 후; UI+API 병렬이면 Gate 2 후 `parallel-delivery` 병행)
- 버그 수정 요청이면 `bugfix-flow`를 우선 고려한다.
- 요구사항이 모호하거나 기획 정리가 먼저 필요하면 `plan-feature`를 우선 고려한다.
- 구현 후 품질 확인이 필요하면 `verify-change`를 사용한다. (Gate 3 종료 검증)
- 변경사항 공유나 문서 정리가 필요하면 `document-change`를 사용한다. (병렬 중 계약 변경 시에도 수시 적용)
- 배포 전 확인이 필요하면 `release-check`를 사용한다.

## 직접 처리 가능한 예외
아래와 같은 매우 작은 작업은 메인 에이전트가 직접 처리할 수 있다.
- 오탈자 수정
- 문구 수정
- 주석 수정
- 단순 링크 수정
- 명백한 단일 파일 소규모 스타일 조정

## 다중 작업 처리 원칙
하나의 요청에 여러 관심사가 섞여 있으면 역할별로 나눠 처리한다.
예:
- 화면 + API 변경: `frontend-agent` + `backend-agent`
- 기능 추가 + 요구사항 애매함: `plan-feature` 후 `start-feature`
- 고객사 전체 납품 라이프사이클: `client-project-lifecycle`
- Gate 2 충족 후 UI+API 동시 진행: `parallel-delivery` (`frontend-agent` + `backend-agent`)
- 구현 완료 + QA 필요: `verify-change`
- 수정 완료 + 전달 문서 필요: `document-change`

## 금지사항
- Rules에 적힌 전역 정책을 Skills에 반복해서 장황하게 복붙하지 않는다.
- Agent 파일에 프로젝트 전역 정책을 중복 정의하지 않는다.
- 충분한 근거 없이 구조를 전면 개편하지 않는다.
- 필요한 기준 파일이 없는데도 임의로 설계를 확정하지 않는다.
- 웹/앱 차이를 무시하고 동일 UX를 강제하지 않는다.