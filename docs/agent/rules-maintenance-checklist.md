# Rules maintenance checklist

규칙을 수정할 때 아래를 짧게 확인한다.

## User-level 규칙을 바꿀 때
- [ ] 실행 계획/분담/미확정 의사결정 문구가 `AGENTS.md` 운영 원칙과 모순 없는지
- [ ] 출력/완료 판정 문구가 스킬 문서(`start-feature`, `client-project-lifecycle`)와 모순 없는지

## `AGENTS.md`를 바꿀 때
- [ ] 우선순위 순서가 `60`·`70` 및 User-level 규칙과 실제로 어긋나지 않는지
- [ ] **정책 출처(SSOT)** 절이 User-level(계획/분담)과 본 파일(직접 처리 목록) 역할 분담과 어긋나지 않는지
- [ ] “직접 처리 가능한 예외” 섹션과 `60` Gate 1 적용 범위가 함께 읽혀도 되는지

## `60-delivery-gates.mdc`를 바꿀 때
- [ ] Gate 1 면제 문구가 `AGENTS.md` **직접 처리 가능한 예외** 섹션(SSOT)만 가리키고, 목록 확장을 다른 파일로 새지 않았는지
- [ ] `AGENTS.md`의 게이트 요약·Gate 1 적용 범위 이해와 충돌 없는지
- [ ] `70-client-lifecycle-default.mdc`·`AGENTS.md` 고객 프로젝트 절차와 모순 없는지
- [ ] Gate 1 `비고`( `64` / `context-organization` )와 문구가 함께 읽혀도 Gate **조건**이 바뀌는 것이 아님이 분명한지

## `64-context-organization.mdc`를 바꿀 때
- [ ] `60`의 Gate 1/2/3 **정의·적용**을 **복붙**하거나 완화하지 않았는지(경계·용어·권한만)
- [ ] `70`·`client-project-lifecycle` HUMAN **우선**·`context-organization` **선행**이 모순 없이 읽히는지
- [ ] User-level skill `context-organization`·`plan-feature`·`AGENTS`와 **중복** 정의 늪이 없는지

## 새 규칙 파일을 추가할 때
- [ ] `docs/agent/rules-context-notes.md`의 한 줄 요약 표에 행 추가
- [ ] `alwaysApply`·`description` 의도 명확한지

## `.cursor/skills`에 `context-organization` 등 **선행 러브릭** 스킬을 바꿀 때
- [ ] `64`·`60`·`plan-feature`와 **Gate/조건**이 이중·모순 정의되지 않는지(위임·링크 위주)
- [ ] 고객 HUMAN: `70` + `client-project-lifecycle` **우선** 문장 유지

## 완료 루프 하네스(`delivery-loop`) 훅·스크립트를 바꿀 때
- [ ] `docs/agent/delivery-loop-harness.md`·`client-project-lifecycle`의 **선택** 절과 **HUMAN 비변** 문구가 모순 없는지
- [ ] 훅이 **차단(exit 1)** 으로 바뀌면 User-level 출력/완료 규칙과 `AGENTS` 우선순위에 대한 운영 합의가 있는지
