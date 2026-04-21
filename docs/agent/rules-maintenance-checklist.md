# Rules maintenance checklist

규칙을 수정할 때 아래를 짧게 확인한다.

## `00-global.mdc`를 바꿀 때
- [ ] `75` **미확정 의사결정**·`AGENTS.md` 운영 원칙의 **금지·필수** 문구와 모순 없는지

## `75-plan-and-delegation.mdc`를 바꿀 때
- [ ] `AGENTS.md`의 운영 원칙·**규칙 우선순위**·직접 처리 예외·**미확정 의사결정** 참조 한 줄과 문구가 모순 없는지
- [ ] `60-delivery-gates.mdc`의 “착수 시 계획 형식” 언급과 일치하는지

## `60-delivery-gates.mdc`를 바꿀 때
- [ ] `AGENTS.md`의 게이트 요약·Gate 1 적용 범위 이해와 충돌 없는지
- [ ] `70-client-lifecycle-default.mdc`·`AGENTS.md` 고객 납품 절과 모순 없는지

## `AGENTS.md`를 바꿀 때
- [ ] 우선순위 순서가 `60`·`70`·`75`와 실제로 어긋나지 않는지
- [ ] “직접 처리 예외”와 `75` 라이트 템플릿·`60` Gate 1 적용 범위가 함께 읽혀도 되는지

## 새 규칙 파일을 추가할 때
- [ ] `docs/agent/rules-context-notes.md`의 한 줄 요약 표에 행 추가
- [ ] `alwaysApply`·`description` 의도 명확한지
