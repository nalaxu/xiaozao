#!/usr/bin/env bash
# 每分钟由 /etc/cron.d/howtocook 调用。上一次没跑完时跳过（flock）。
set -euo pipefail
secret=$(grep -E '^CRON_SECRET=' /etc/howtocook/env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
flock -n /tmp/howtocook-cron.lock \
  curl -fsS -m 290 -o /dev/null -H "Authorization: Bearer $secret" http://127.0.0.1:3000/api/cron/tick \
  || logger -t howtocook-cron "cron tick 失败或上一次仍在运行"
