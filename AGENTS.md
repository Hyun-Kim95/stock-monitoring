# AGENTS

## 목적

이 프로젝트의 메인 에이전트는 요청을 분석하고, 적절한 Rules, Skills, Subagents를 선택해 작업을 진행한다.

이 파일은 총괄 오케스트레이션만 담당한다.
세부 정책은 `.cursor/rules/`, 작업 절차는 기본적으로 User-level skills(로컬에는 `client-project-lifecycle` 중심)을 따른다. 역할별 전문 범위는 아래 **역할 분담 기준**이 SSOT이며, 별도 `.cursor/agents/*.md`가 있으면 그 파일을 보조 참고로 쓴다(없어도 본 절로 충분하다).

## 정책 출처(SSOT)

- 실행 계획 형식, 라이트/풀 선택, 분담 임계치·서브 타입 매핑·재계획: User-level 규칙이 SSOT다.
- **직접 처리 가능한 예외**의 목록(아래 해당 섹션)은 **본 파일이 SSOT**다. 다른 규칙·스킬은 목록을 늘리지 않고 이 섹션을 가리킨다.

## 운영 원칙

- 공통 작업 원칙(계획/출력/커밋 안전/완료 보고)은 User-level 규칙을 기본으로 적용한다.
- 이 파일은 오케스트레이션, 역할 분담, 우선순위, 직접 처리 예외 목록 같은 **프로젝트 로컬 SSOT**만 다룬다.
- 실행 계획 상세 형식과 재계획 트리거는 User-level 규칙을 따른다.
- `start-feature`·`plan-feature`·`parallel-delivery`·`verify-change`·`document-change`·`bugfix-flow`·`release-check`는 User-level skills를 우선 사용한다.
- 고객 프로젝트형 게이트/승인 흐름은 `.cursor/rules/60-delivery-gates.mdc`, `.cursor/rules/70-client-lifecycle-default.mdc`를 따른다.
- 같은 내용을 Rules, Skills, Agents 파일에 중복 정의하지 않는다.
- 규칙이 많을 때의 초점 맞추기·한 줄 요약은 `docs/agent/rules-context-notes.md`를 참고한다.
- 규칙 파일을 고칠 때의 정합 점검은 `docs/agent/rules-maintenance-checklist.md`를 참고한다.

## 규칙 우선순위 (충돌 시)

아래 순서를 기본으로 해석한다(위가 더 우선).

1. 사용자가 대화에서 **명시한 지시**(범위·예외·긴급도 포함)
2. **안전·보안·민감정보** 보호(유출 방지, 권한, 비밀 커밋 방지 등)
3. `.cursor/rules/70-client-lifecycle-default.mdc`에 따른 **고객 프로젝트 흐름** 중 스킬이 정한 **HUMAN·승인·멈춤** 구간
4. `.cursor/rules/60-delivery-gates.mdc`의 **Gate** 조건(신규 기능·대외 API 등에 적용; Gate 1 적용 범위는 해당 파일의 설명을 따른다)
5. User-level 규칙의 **실행 계획/출력 계약** 형식
6. 그 외 제품 UI·스타일·테이블 등 나머지 `.cursor/rules/`

**충돌 시 행동:** 우선순위를 스스로 판단하기 어렵거나 구현이 멈출 수 있으면, **구현을 잠시 멈추고** 짧은 **확인 질문 1~2개**를 먼저 한다.

## 역할 분담 기준

- UI, 반응형, 마크업, 화면 동작, 스타일, 접근성: `frontend-agent`
- API, DB, 서비스, 인증, 권한, 파일 처리: `backend-agent`
- 요구사항 정리, 정책 설계, 화면/기능 범위 정의: `prd-agent`
- 구현 결과 검증, 회귀 점검, 체크리스트 기반 확인: `qa-agent`
- 작업 내역 정리, 변경사항 문서화, README/인수인계: `docs-agent`
- 디자인 토큰, 테마, 다크모드, 컴포넌트 일관성: `design-system-agent`

위 이름은 **역할·전문 범위·체크리스트**를 가리킨다. 실행 환경에 별도 서브에이전트 세션이 없을 수 있으며, 그 경우 **메인 에이전트가 동일 범위를 수행**한다. 실행 계획에는 그대로 **담당(역할)**과 **그 역할을 택한 이유**를 적는다.

서브에이전트·병렬 작업 시 컨텍스트를 맞추려면 `docs/agent/agent-brief.md` 템플릿을 쓴다. 요구사항 변경, API 계약 변경, 병렬 중 상대방 산출물이 바뀌면 해당 브리프의 메타·관련 섹션을 **갱신**한다.

## 재사용 최소 복사 세트

다른 프로젝트에 동일 규칙을 적용할 때는 아래 파일을 최소 세트로 복사한다.

- `AGENTS.md` (운영 원칙·역할 분담·우선순위·**직접 처리 예외 목록 SSOT**)
- `.cursor/rules/60-delivery-gates.mdc`, `.cursor/rules/70-client-lifecycle-default.mdc` (고객 프로젝트형 로컬 규칙)

## 게이트/병렬/완료 기준

- Gate 1~3, 병렬 조건, DoD는 `.cursor/rules/60-delivery-gates.mdc`를 SSOT로 따른다.
- 디자인 승인과 구현 착수 승인 통합 규칙은 `.cursor/rules/70-client-lifecycle-default.mdc`를 따른다.
- 본 파일에는 게이트 세부 불릿을 중복 정의하지 않는다.

## 기본 진입 규칙

- **이미 운영 중인 코드베이스(본 레포)에서의 유지보수** — 버그 수정, 소규모 개선, 기존 범위 내 기능 확장 — 은 `70`이 가리키는 “고객사 전체(엔드투엔드) **신규** 납품”과 구분한다. 기본은 `bugfix-flow` 또는 `start-feature`(또는 Gate·계약이 이미 정해진 변경은 `60`·`AGENTS` 직접 처리 예외)를 쓰고, **요구가 고객 신규 E2E 납품(원문 반입·PRD부터 끝까지)으로 명확할 때만** `client-project-lifecycle`을 따른다.
- 고객사 **전체 프로젝트(엔드투엔드)** 대화는 사용자가 스킬 이름을 말하지 않아도 `.cursor/rules/70-client-lifecycle-default.mdc`에 따라 `client-project-lifecycle`을 따른다(PRD·디자인 등 HUMAN 구간에서 멈춤). 단, **디자인 승인 완료 시점은 구현 착수 승인으로 간주**하며 구현 시작에 대한 중복 승인을 추가로 요구하지 않는다. 구현 이후 **다축 검증·리뷰어 GATE**는 해당 스킬 **단계 4B~4D(선택)** 및 `docs/qa/reviewer-gate-rubric.md`를 참고한다.
- 고객사 신규 프로젝트를 **요구 붙여넣기 → PRD 승인 → 이중 목업 → 디자인 승인(=구현 착수 승인) → 병렬 구현 → 테스트·성능** 순으로 끝까지 진행하려면 `client-project-lifecycle`을 우선 고려한다.
- 신규 기능 요청이면 `start-feature`를 우선 고려한다. (Gate 1 통과 후; UI+API 병렬이면 Gate 2 후 `parallel-delivery` 병행)
- 버그 수정 요청이면 `bugfix-flow`를 우선 고려한다.
- 요구사항이 모호하거나 기획 정리가 먼저 필요하면 `plan-feature`를 우선 고려한다. (같은 선행을 3단 러브릭으로 쪼개려면 `context-organization`을 쓸 수 있으며, 둘 다 `60`·`70`·`AGENTS` 및 User-level 계획/분담 규칙에 종속이고, 러프한 아이디어/기획·스펙 부재일 때는 `plan-feature`·`context-organization` → Gate 1 충족 시 `start-feature` 순을 따른다.)
- 구현 후 품질 확인이 필요하면 `verify-change`를 사용한다. (Gate 3 종료 검증)
- 변경사항 공유나 문서 정리가 필요하면 `document-change`를 사용한다. (병렬 중 계약 변경 시에도 수시 적용)
- 배포 전 확인이 필요하면 `release-check`를 사용한다.

## 직접 처리 가능한 예외

(SSOT: 이 목록만 확장·수정한다. 라이트 템플릿 적합 여부 등은 User-level 계획/분담 규칙에서 본 섹션을 참조한다.)

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
- 고객사 전체 프로젝트 라이프사이클: `client-project-lifecycle`
- Gate 2 충족 후 UI+API 동시 진행: `parallel-delivery` (`frontend-agent` + `backend-agent`)
- 구현 완료 + QA 필요: `verify-change`
- 수정 완료 + 전달 문서 필요: `document-change`

## 분담 임계치

- 분담 판단/서브 타입 매핑은 User-level 규칙을 SSOT로 따른다.

## 금지사항

- Rules에 적힌 전역 정책을 Skills에 반복해서 장황하게 복붙하지 않는다.
- Agent 파일에 프로젝트 전역 정책을 중복 정의하지 않는다.
- 충분한 근거 없이 구조를 전면 개편하지 않는다.
- 필요한 기준 파일이 없는데도 임의로 설계를 확정하지 않는다.
- 웹/앱 차이를 무시하고 동일 UX를 강제하지 않는다.

