#!/usr/bin/env bash
# Mengaktifkan git hooks bersama dari folder .githooks/.
# Jalankan sekali setelah clone: bash scripts/setup-hooks.sh
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "setup-hooks: jalankan dari dalam repositori git." >&2
  exit 1
}

cd "$root"
chmod +x .githooks/*
git config core.hooksPath .githooks

echo "Git hooks aktif dari .githooks/:"
ls -1 .githooks | sed 's/^/  - /'
echo
echo "Identitas commit saat ini: $(git config user.name 2>/dev/null || echo '(belum diatur)') <$(git config user.email 2>/dev/null || echo 'belum diatur')>"
