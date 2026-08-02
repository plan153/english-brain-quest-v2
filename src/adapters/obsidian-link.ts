/**
 * obsidian-link.ts — obsidian:// 딥링크 생성.
 * 학습자가 「볼트에서 이 Gap 열기」를 누르면 옵시디언 앱이 바로 해당 노트를 열게 한다.
 * 볼트 이름은 Mac import 스크립트(scripts/import-ebq-vault-zip.sh)의 기본 경로와
 * 맞춰 Project_English를 기본값으로 쓰고, 다르면 로컬 설정으로 바꿀 수 있다.
 */
import { readLocal, writeLocal } from './storage';

const DEFAULT_VAULT_NAME = 'Project_English';

export function getObsidianVaultName(): string {
  return readLocal<string>('obsidianVaultName') || DEFAULT_VAULT_NAME;
}

export function setObsidianVaultName(name: string): void {
  const trimmed = name.trim();
  writeLocal('obsidianVaultName', trimmed || DEFAULT_VAULT_NAME);
}

/** Gaps/<gapId>.md 노트를 여는 obsidian:// URI (Obsidian 규칙상 확장자 제외) */
export function obsidianGapUri(userId: string, gapId: string): string {
  const vault = getObsidianVaultName();
  const path = `Learners/${userId}/Gaps/${gapId}`;
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`;
}
