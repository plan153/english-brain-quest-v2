# Vault Markdown Schema (EBQ → Obsidian)

앱이 동기화할 때 만드는 제2영어뇌 구조입니다. **앱 = SRS·출제**, **볼트 = 거울·그래프**.

## 폴더

```text
Learners/<learnerId>/
  English Brain Index.md      # MOC
  Learning/
    Brain.md                  # 숙련도 · 약점 · 복습 대기
    Progress.md               # 수치 대시보드 (Progress.md 관례)
  Gaps/
    _Index.md                 # Gaps MOC + Dataview 쿼리
    gap_<expr>_<date>_<hash>.md
  Patterns/
    subject.md | verb.md | noun.md | tense.md | agreement.md
```

ZIP 내보내기·Mac import는 `Learners/me/` 경로를 사용합니다.

## Gap frontmatter

| 필드 | 설명 |
|------|------|
| `type` | `gap` |
| `expressionId` | 문장 ID |
| `en` / `ko` / `guess` | 정답 · 뜻 · 내 추측 |
| `match` | `wrong` \| `skipped` |
| `cueMode` | `blind` \| `after_listen` \| `after_reveal` |
| `inputMode` | `speak` \| `type` |
| `slots` | 문제 슬롯 배열 예: `[subject, agreement]` |
| `reasonStatus` | `pending` \| `confirmed` \| `edited` |
| `tags` | `ebq`, `gap`, `pattern/<slot>` …

본문 섹션 `## 내 추측` / `## 정답` / `## 간극이 생긴 이유` 는 import가 읽습니다. 유지하세요.

## Patterns

Gap의 `slots` / 태그 `pattern/subject` 등이 Patterns 허브와 연결됩니다. Dataview로 같은 슬롯 Gap을 모을 수 있습니다.

## 동기화

`syncToVault` → Brain, Progress, Index, Gaps/_Index, Patterns/*, 세션 Gap 노트.
