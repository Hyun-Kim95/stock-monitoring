# Delivery loop harness (Ralph-style, optional)

고객 프로젝트 흐름([`client-project-lifecycle`](../../.cursor/skills/client-project-lifecycle/SKILL.md))에서 **단계 3(Gate 2 확정) 이후** 구현·검증 구간에, **상태 파일 + 짧은 훅 가드 + (선택) 터미널 루프**로 “수정 → 검증 → 기록”을 반복하기 위한 선택 도구다. **PRD 승인·디자인 선택·리뷰어 GATE HUMAN**을 대체하거나 자동 통과시키지 않는다.

## 구성 요소

| 구성 | 경로 | 역할 |
|------|------|------|
| 상태 예시 | [docs/qa/delivery-loop-state.example.json](../qa/delivery-loop-state.example.json) | 팀이 복사해 `.cursor/state/delivery-ralph.json`으로 쓰거나 `-Initialize`로 생성 |
| 실제 상태 | `.cursor/state/delivery-ralph.json` | 로컬 전용. 루트 [`.gitignore`](../../.gitignore)에 무시 항목으로 등록됨 |
| 훅 | [`.cursor/hooks/guard-delivery-loop.ps1`](../../.cursor/hooks/guard-delivery-loop.ps1) | `afterFileEdit`에서 **경고만**(기본). `enabled=true` 이고 `lifecyclePhase`가 `verify` / `perf` / `blocker_loop`일 때만 동작 |
| 루프 스크립트 | [scripts/delivery/Invoke-DeliveryLoop.ps1](../../scripts/delivery/Invoke-DeliveryLoop.ps1) | 테스트 명령을 **exit code 0**이 될 때까지(상한 내) 반복 실행하고 상태 JSON 갱신 |

## 상태 JSON 필드

- `enabled` (bool): `false`면 훅·러너가 상태를 읽고 즉시 종료한다.
- `lifecyclePhase` (string): `idle` | `impl` | `verify` | `blocker_loop` | `perf`. 훅 가드는 **`verify`·`perf`·`blocker_loop`** 에서만 완료 선언을 검사한다.
- `gate2ChecklistPath` (string): 참고용 경로(훅은 파일 내용을 파싱하지 않음).
- `blockNonEvidenceCompletion` (bool): `true`이면 체크리스트 항목이 있어도 **증빙 키워드**가 페이로드에 최소 2종 있어야 통과로 본다.
- `checklistItems` (array): `{ "id", "done", "evidencePath" }`. 항목이 하나라도 있으면 **모두 `done: true`** 여야 완료 선언이 통과한다. 항목이 **없으면** [`guard-completion-claims`](../../.cursor/hooks/guard-completion-claims.ps1)와 같이 페이로드에 증빙 키워드 **2종 이상**이 필요하다.
- `iteration`, `maxIterations`, `lastCommand`, `lastExitCode`, `updatedAt`: 러너가 갱신한다.

## 훅 동작 요약

- Cursor [`hooks.json`](../../.cursor/hooks.json)에 등록되어 있으며, **타임아웃(20초) 안**에서만 동작한다. 긴 테스트는 훅이 아니라 `Invoke-DeliveryLoop.ps1`에서 실행한다.
- **쿨다운 20초**로 동일 경고 스팸을 줄인다.
- 경고 로그: `.cursor/state/delivery-loop-warnings.log`

## 루프 스크립트 사용법

프로젝트 루트에서:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\delivery\Invoke-DeliveryLoop.ps1" -Initialize
```

`.cursor/state/delivery-ralph.json`이 없으면 예시 JSON을 복사해 만든다. 이후 `enabled`와 `lifecyclePhase`를 편집한 뒤:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\delivery\Invoke-DeliveryLoop.ps1" -TestCommand "npm test" -MaxIterations 20 -MaxMinutes 120
```

`enabled=false`이면 테스트를 실행하지 않고 종료한다. 성공 시 exit 0, 상한 초과 시 exit 1, 시간 초과 시 exit 2.

## Cursor 편집 훅과의 관계

문서 저장 시 Obsidian 동기화 등은 [Obsidian 로컬 자동화](../requirements/obsidian-local-automation.md)를 따른다. 본 하네스는 **검증·완료 구간**의 선택 보조이며, 기존 `guard-completion-claims`와 **병행**된다.

## 차단 모드

현재 훅은 **편집을 차단하지 않는다**(fail-open). 팀 정책으로 `exit 1` 차단을 넣을 경우 User-level 출력/완료 규칙과 `AGENTS.md` 우선순위를 함께 검토한다.
