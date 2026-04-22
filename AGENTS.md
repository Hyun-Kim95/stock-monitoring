# AGENTS

## 목적
이 프로젝트의 메인 에이전트는 요청을 분석하고, 적절한 Rules, Skills, Subagents를 선택해 작업을 진행한다.

이 파일은 총괄 오케스트레이션만 담당한다.
세부 정책은 `.cursor/rules/`, 작업 절차는 `.cursor/skills/`, 역할별 전문 범위는 `.cursor/agents/`에서 관리한다.

## 운영 원칙
- 사용자가 **커밋·푸시**를 요청하면 `.cursor/rules/15-git-commit-push.mdc`에 따라 **커밋/푸시 전 `.gitignore` 및 추적 대상 점검**을 항상 수행한다.
- 항상 기존 프로젝트 구조와 기술 스택을 우선 존중한다.
- 모든 작업은 착수 전에 **실행 계획**을 먼저 제시한다. (처리 방식, 선택 이유, 담당 분해, 병렬 여부, 완료 기준 포함)
- 실행 계획의 각 단계에는 담당 주체를 반드시 `Owner: Main Agent | Subagent(<type>)` 형식으로 표기한다.
- 계획 마지막에는 `Integration Owner: Main Agent`와 실행 순서(순차/병렬 그룹)를 명시한다.
- **직접 처리 가능한 예외**에 해당하는 작업은 실행 계획을 `.cursor/rules/75-plan-and-delegation.mdc`의 **라이트 템플릿** 범위로 제한한다. 사용자가 **라이트만·계획 축약**을 요청한 경우에도 동일하게 따른다.
- 사용자 입력은 기본적으로 **문장형 1~2문장 명령**으로 받고, 결과 형식·산출물 표기·승인 대기는 `.cursor/rules/55-output-contract.mdc`를 우선 적용한다.
- 작업 성격에 맞는 전문 서브에이전트가 있으면 우선 사용을 고려한다.
- 매우 작은 수정은 메인 에이전트가 직접 처리할 수 있다.
- 구현 후 검증과 문서화를 가능한 한 생략하지 않는다.
- 같은 내용을 Rules, Skills, Agents 파일에 중복 정의하지 않는다.
- 확실하지 않은 내용은 추정으로 단정하지 말고, 가정과 확인 필요사항을 명시한다.
- 기술 스택·레포 구조·도메인·제품 요구가 **미확정**인 채로 되돌리기 비싼 스캐폴딩·루트 구조·스택을 **임의 확정하는 코드·설정 변경은 하지 않는다**. 반드시 `.cursor/rules/75-plan-and-delegation.mdc`의 **미확정 의사결정(지연 선택)** 형식으로 옵션을 제시하고, 사용자가 고르거나 **「추천대로」**로 **명시 확정**한 뒤에만 해당 방향 구현을 진행한다.
- 실행 계획의 상세 형식과 재계획 트리거는 `.cursor/rules/75-plan-and-delegation.mdc`를 따른다.
- 규칙이 많을 때의 초점 맞추기·한 줄 요약은 `docs/agent/rules-context-notes.md`를 참고한다.
- 규칙 파일을 고칠 때의 정합 점검은 `docs/agent/rules-maintenance-checklist.md`를 참고한다.

## 규칙 우선순위 (충돌 시)
아래 순서를 기본으로 해석한다(위가 더 우선).
1. 사용자가 대화에서 **명시한 지시**(범위·예외·긴급도 포함)
2. **안전·보안·민감정보** 보호(유출 방지, 권한, 비밀 커밋 방지 등)
3. `.cursor/rules/70-client-lifecycle-default.mdc`에 따른 **고객 납품 흐름** 중 스킬이 정한 **HUMAN·승인·멈춤** 구간
4. `.cursor/rules/60-delivery-gates.mdc`의 **Gate** 조건(신규 기능·대외 API 등에 적용; Gate 1 적용 범위는 해당 파일의 설명을 따른다)
5. `.cursor/rules/75-plan-and-delegation.mdc`의 **실행 계획** 제시 형식
6. `.cursor/rules/55-output-contract.mdc`의 **출력 계약**(문장형 입력 해석, 보고 형식, 승인 대기)
7. 그 외 제품 UI·스타일·테이블 등 나머지 `.cursor/rules/`

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
- `AGENTS.md` (본 파일의 운영 원칙/역할 분담/우선순위 포함)
- `.cursor/rules/55-output-contract.mdc` (입력 해석/출력 계약/승인 대기 형식)
- `.cursor/rules/60-delivery-gates.mdc` (Gate 기준 및 단계 전환 조건)
- `.cursor/rules/70-client-lifecycle-default.mdc` (고객 납품 흐름 기본값)
- `.cursor/rules/75-plan-and-delegation.mdc` (계획 단계 Owner 표기 및 분담 규칙)

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

## 분담 임계치(요약)
- 단일 파일·저위험·명확한 변경은 메인 에이전트 직접 처리를 우선한다.
- 공통 토큰/테마/다크모드·권한·API 계약 변경처럼 파급 범위가 큰 경우 전문 서브에이전트를 우선 고려한다.
- UI+API처럼 서로 다른 전문 영역이 필요한 작업은 Gate 2 조건 충족 시 병렬 분담을 고려한다.
- 정책·권한·핵심 UX가 미확정이면 병렬 대신 직렬로 진행하고, 필요하면 `plan-feature`로 되돌린다.

## 금지사항
- Rules에 적힌 전역 정책을 Skills에 반복해서 장황하게 복붙하지 않는다.
- Agent 파일에 프로젝트 전역 정책을 중복 정의하지 않는다.
- 충분한 근거 없이 구조를 전면 개편하지 않는다.
- 필요한 기준 파일이 없는데도 임의로 설계를 확정하지 않는다.
- 웹/앱 차이를 무시하고 동일 UX를 강제하지 않는다.