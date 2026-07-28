/**
 * 옵시디언 Project_English 볼트 Library 원문 ↔ 앱 콘텐츠 팩 매핑.
 * 앱 JSON이 출제 소스, 볼트 MD는 읽기·링크·복습용. 내용은 동일 계열.
 *
 * Vault root 예: …/Obsidian Vault/Project_English/
 */
export const VAULT_LIBRARY_PATTERNS = {
  /** 퀴즈 잉글리시 기본동사 100 */
  quizVerbs: {
    packId: 'quiz-verbs',
    vaultRelPath: 'Library/Patterns/기본동사 100.md',
    wikiLink: 'Library/Patterns/기본동사 100',
    title: '기본동사 100',
  },
  /** 김재우 영어회화 100 미니북 */
  conversation100: {
    packId: 'conversation-100',
    vaultRelPath: 'Library/Patterns/영어회화 100.md',
    wikiLink: 'Library/Patterns/영어회화 100',
    title: '영어회화 100',
  },
} as const;

export type VaultLibraryKey = keyof typeof VAULT_LIBRARY_PATTERNS;

export function vaultLibraryBrainSection(): string {
  const lines = Object.values(VAULT_LIBRARY_PATTERNS).map(
    (e) => `- [[${e.wikiLink}|${e.title}]] ← 앱 팩 \`${e.packId}\``
  );
  return `## Library 원문 (Patterns)

앱 Today 팩과 같은 문장 모음. 볼트에서 Day·동사별로 읽고 링크하세요.

${lines.join('\n')}
`;
}

export function vaultPathForPack(packId: string): string | undefined {
  for (const e of Object.values(VAULT_LIBRARY_PATTERNS)) {
    if (e.packId === packId) return e.vaultRelPath;
  }
  return undefined;
}
