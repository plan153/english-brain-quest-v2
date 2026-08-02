#!/usr/bin/env bash
# import-ebq-vault-zip.sh — 아이폰에서 보낸 ebq-vault-*.zip 을 Obsidian Vault에 자동 배치
# 사용:
#   ./import-ebq-vault-zip.sh          # 한 번 실행 (Inbox/Downloads/Vault 루트 스캔)
#   EBQ_VAULT="..." ./import-ebq-vault-zip.sh
set -euo pipefail

VAULT="${EBQ_VAULT:-/Users/mini/Obsidian Vault/Project_English}"
INBOX="$VAULT/_Inbox/EBQ"
LEARNING="$VAULT/Learners/me/Learning"
GAPS_DIR="$VAULT/Learners/me/Gaps"
LOG="${EBQ_IMPORT_LOG:-$HOME/Library/Logs/ebq-vault-import.log}"

mkdir -p "$INBOX" "$LEARNING" "$GAPS_DIR" "$(dirname "$LOG")"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$LOG" >/dev/null
  echo "$msg"
}

place_note() {
  local src="$1"
  local dest_name="$2" # Brain.md | Progress.md
  local dest="$LEARNING/$dest_name"
  if [[ ! -f "$src" ]]; then
    return 1
  fi
  mkdir -p "$LEARNING"
  # APFS 대소문자 무시 환경에서도 대상 이름으로 직접 덮어씀
  cat "$src" >"$dest"
  log "배치: $dest"
  return 0
}

place_gaps() {
  local root="$1"
  local src_dir="$root/Learners/me/Gaps"
  local found=0
  [[ -d "$src_dir" ]] || return 1
  local f
  for f in "$src_dir"/*.md; do
    [[ -f "$f" ]] || continue
    cp -f "$f" "$GAPS_DIR/$(basename "$f")"
    found=1
  done
  if [[ "$found" -eq 1 ]]; then
    log "배치: Gaps → $GAPS_DIR"
  fi
  return $((1 - found))
}

import_from_dir() {
  local root="$1"
  local found=0
  # 정상 경로
  if [[ -f "$root/Learners/me/Learning/Brain.md" ]]; then
    place_note "$root/Learners/me/Learning/Brain.md" "Brain.md" && found=1
  fi
  if [[ -f "$root/Learners/me/Learning/progress.md" ]]; then
    place_note "$root/Learners/me/Learning/progress.md" "Progress.md" && found=1
  elif [[ -f "$root/Learners/me/Learning/Progress.md" ]]; then
    place_note "$root/Learners/me/Learning/Progress.md" "Progress.md" && found=1
  fi
  # 잘못된 위치 (Learners/me/ 직하)
  if [[ -f "$root/Learners/me/Brain.md" ]]; then
    place_note "$root/Learners/me/Brain.md" "Brain.md" && found=1
  fi
  if [[ -f "$root/Learners/me/progress.md" ]]; then
    place_note "$root/Learners/me/progress.md" "Progress.md" && found=1
  elif [[ -f "$root/Learners/me/Progress.md" ]]; then
    place_note "$root/Learners/me/Progress.md" "Progress.md" && found=1
  fi
  place_gaps "$root" && found=1
  return $((1 - found))
}

import_zip() {
  local zip="$1"
  [[ -f "$zip" ]] || return 0
  local base
  base="$(basename "$zip")"
  case "$base" in
    ebq-vault-*.zip) ;;
    *) return 0 ;;
  esac

  local tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/ebq-import.XXXXXX")"
  log "ZIP 처리: $zip"
  if ! unzip -q -o "$zip" -d "$tmp"; then
    log "실패: unzip $zip"
    rm -rf "$tmp"
    return 1
  fi

  # Finder가 zip 이름으로 한 겹 더 만든 경우 대비
  local search_roots=("$tmp")
  local nested
  while IFS= read -r nested; do
    search_roots+=("$nested")
  done < <(find "$tmp" -type d -name 'ebq-vault-*' 2>/dev/null)

  local ok=0
  for root in "${search_roots[@]}"; do
    if import_from_dir "$root"; then
      ok=1
    fi
  done

  rm -rf "$tmp"

  if [[ "$ok" -eq 1 ]]; then
    rm -f "$zip"
    log "ZIP 삭제: $base"
  else
    log "경고: $base 에서 Brain/progress 를 찾지 못함 (ZIP 유지)"
  fi
}

cleanup_vault_litter() {
  # Vault 루트에 풀린 잔여 폴더/zip/안내문
  local d
  for d in "$VAULT"/ebq-vault-*; do
    [[ -e "$d" ]] || continue
    if [[ -d "$d" ]]; then
      import_from_dir "$d" || true
      rm -rf "$d"
      log "잔여 폴더 삭제: $(basename "$d")"
    elif [[ -f "$d" && "$d" == *.zip ]]; then
      import_zip "$d"
    fi
  done
  rm -f "$VAULT/README-EBQ.txt" 2>/dev/null || true

  # Learners/me 직하에 잘못 둔 파일 → Learning 으로 옮긴 뒤 삭제
  if [[ -f "$VAULT/Learners/me/Brain.md" ]]; then
    place_note "$VAULT/Learners/me/Brain.md" "Brain.md" || true
    rm -f "$VAULT/Learners/me/Brain.md"
  fi
  if [[ -f "$VAULT/Learners/me/progress.md" ]]; then
    place_note "$VAULT/Learners/me/progress.md" "Progress.md" || true
    rm -f "$VAULT/Learners/me/progress.md"
  fi
}

main() {
  log "=== EBQ Vault import 시작 ==="
  log "Vault: $VAULT"

  cleanup_vault_litter

  local zip
  for zip in "$INBOX"/ebq-vault-*.zip; do
    [[ -f "$zip" ]] || continue
    import_zip "$zip"
  done
  for zip in "$HOME/Downloads"/ebq-vault-*.zip; do
    [[ -f "$zip" ]] || continue
    import_zip "$zip"
  done
  for zip in "$HOME/Desktop"/ebq-vault-*.zip; do
    [[ -f "$zip" ]] || continue
    import_zip "$zip"
  done

  # Inbox 안내 파일
  if [[ ! -f "$INBOX/README.txt" ]]; then
    cat >"$INBOX/README.txt" <<'EOF'
아이폰에서 ebq-vault-….zip 을 이 폴더로 AirDrop / 저장하세요.
자동으로 Learners/me/Learning/ 에 Brain.md · Progress.md,
Learners/me/Gaps/ 에 간극 노트가 배치되고 ZIP은 삭제됩니다.
EOF
  fi

  log "=== 완료 ==="
  log "확인: $LEARNING"
  ls -la "$LEARNING" | tee -a "$LOG" >/dev/null || true
}

main "$@"
