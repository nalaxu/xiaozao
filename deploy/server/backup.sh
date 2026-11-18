#!/usr/bin/env bash
# 每天由 /etc/cron.d/howtocook 调用：导出数据库、同步图片到 /var/backups/howtocook，数据库备份保留 14 天。
# 这只防误操作和数据损坏，不防整台服务器丢失——请定期把这个目录复制到别处（见 docs/DEPLOY.md）。
set -euo pipefail
get() { grep -E "^$1=" /etc/howtocook/env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

dir=/var/backups/howtocook
ts=$(date +%Y%m%d-%H%M%S)
db_url=$(get DATABASE_URL)
image_dir=$(get IMAGE_DIR)

pg_dump --format=custom --no-owner --file="$dir/db-$ts.dump.part" "$db_url"
mv "$dir/db-$ts.dump.part" "$dir/db-$ts.dump"
find "$dir" -maxdepth 1 -name 'db-*.dump' -mtime +14 -delete

if [[ -n "$image_dir" && -d "$image_dir" ]]; then
  rsync -a "$image_dir/" "$dir/images/"
fi
logger -t howtocook-backup "备份完成 db-$ts.dump"
