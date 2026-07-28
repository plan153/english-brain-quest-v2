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

### Library 원문 (Project_English 볼트)

앱 Today 팩과 **같은 문장**을 볼트에서 읽을 때 사용합니다. 출제는 앱 JSON, 읽기·링크는 볼트 MD.

| 볼트 경로 | 앱 팩 ID |
|-----------|----------|
| `Library/Patterns/기본동사 100.md` | `quiz-verbs` |
| `Library/Patterns/영어회화 100.md` | `conversation-100` |

매핑 코드: `src/domain/vault-library.ts`. Brain/Index 동기화 시 wiki 링크로 노출됩니다.

## 동기화

`syncToVault` → Brain, Progress, Index, Gaps/_Index, Patterns/*, 세션 Gap 노트.

## 앱 패턴 약점 팩

`gapNotes.slots` → Today **패턴 약점** 팩 / Brain CTA.
슬롯 칩(주어·동사·명사·시제·3sg) 또는 자동(가장 많은 슬롯부터).
