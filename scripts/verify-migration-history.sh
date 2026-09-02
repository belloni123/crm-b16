#!/usr/bin/env sh
set -eu

expected_init='70f780b5c860e886f5c1c501bd39cfc1a5243af695eb62938fc6191c4cb33762'
expected_enhancements='088e65a8a71f8d0462b99929f40cf60803b337e08b7a5560132f6a14c15d22e0'
expected_fields='6f1e1dd86e713ceec6ddd2edbade4861af0bbe17d4c91480e54edebc25a405dc'

verify_file() {
  file=$1
  expected=$2
  actual=$(sha256sum "$file" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$file" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch: $file" >&2
    exit 1
  fi
}

verify_file prisma/migrations/20260606000000_init/migration.sql "$expected_init"
verify_file prisma/migrations/20260606100000_add_crm_enhancements/migration.sql "$expected_enhancements"
verify_file prisma/migrations/20260901150000_add_custom_fields_webhooks/migration.sql "$expected_fields"

case "${DB_SAFETY_SCOPE:-}" in
  isolated|staging) ;;
  *) echo "DB_SAFETY_SCOPE must be isolated or staging; production is intentionally unsupported." >&2; exit 1 ;;
esac

: "${DATABASE_URL:?DATABASE_URL is required}"
npx prisma validate
npx prisma migrate status
echo "Migration history verification passed."
