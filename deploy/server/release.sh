#!/usr/bin/env bash
# 在服务器上以 root 运行（由 deploy/deploy.sh release / rollback 调用）。
#   release.sh <上传目录> <提交号>   新建版本 → 安装依赖 → 迁移 → 构建 → 切换 current → 重启 → 健康检查，失败切回原版本
#   release.sh --rollback            切回上一个版本
# 版本放在 /opt/howtocook/releases/<时间>-<提交号>，/opt/howtocook/current 指向正在运行的版本，保留最近 3 个。
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo "请用 root 运行"; exit 1; }

BASE=/opt/howtocook
ENV_FILE=/etc/howtocook/env
as_app() { sudo -u howtocook -H bash -c "$1"; }

health() {
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null -m 5 http://127.0.0.1:3000/; then return 0; fi
    sleep 2
  done
  return 1
}

switch_to() {
  ln -sfn "$1" "$BASE/current.tmp"
  mv -T "$BASE/current.tmp" "$BASE/current"
  systemctl restart howtocook
}

if [[ ${1:-} == --rollback ]]; then
  cur=$(readlink -f "$BASE/current")
  # 比当前版本早的最近一个
  prev=$(ls -1d "$BASE"/releases/*/ | sed 's|/$||' | sort | awk -v c="$cur" '$0 < c' | tail -1)
  [[ -n "$prev" ]] || { echo "没有可回滚的版本"; exit 1; }
  echo "==> 回滚到 $(basename "$prev")"
  switch_to "$prev"
  health && echo "回滚完成" || { echo "回滚后健康检查失败，查看日志：journalctl -u howtocook -n 200"; exit 1; }
  exit 0
fi

SRC=${1:?缺少上传目录}
SHA=${2:?缺少提交号}
[[ -f $ENV_FILE ]] || { echo "缺少 $ENV_FILE，请先运行 deploy/deploy.sh setup"; exit 1; }
grep -qE '^OPENAI_API_KEY=.+' "$ENV_FILE" || echo "提示：$ENV_FILE 里 OPENAI_API_KEY 还是空的，模型功能会报错。"
grep -qE '^TURNSTILE_SECRET_KEY=.+' "$ENV_FILE" || echo "提示：$ENV_FILE 里 TURNSTILE_SECRET_KEY 还是空的，线上无法发验证码登录。"
grep -qE '^RESEND_API_KEY=.+' "$ENV_FILE" || echo "提示：$ENV_FILE 里 RESEND_API_KEY 还是空的，线上无法发邮件。"

REL="$BASE/releases/$(date +%Y%m%d%H%M%S)-$SHA"
mv "$SRC" "$REL"
chown -R howtocook:howtocook "$REL"
echo "==> 新版本 $(basename "$REL")"

echo "==> 安装依赖"
as_app "cd '$REL' && npm ci --include=dev --no-audit --no-fund --loglevel=error"

echo "==> 数据库迁移"
as_app "cd '$REL' && node --env-file='$ENV_FILE' node_modules/drizzle-kit/bin.cjs migrate"

echo "==> 构建（约 2–4 分钟）"
# 构建时读取 IMAGE_BASE_URL（内容安全策略）和 NEXT_PUBLIC_TURNSTILE_SITE_KEY（前端），所以要带上环境变量
as_app "cd '$REL' && npm run kb --silent && GIT_COMMIT_SHA='$SHA' NODE_OPTIONS=--max-old-space-size=2048 node --env-file='$ENV_FILE' node_modules/next/dist/bin/next build"

PREV=$(readlink -f "$BASE/current" 2>/dev/null || true)
echo "==> 切换并重启"
switch_to "$REL"
if health; then
  echo "==> 发布成功：$(basename "$REL")"
  # 一键更新命令指向当前版本里的脚本
  ln -sfn "$BASE/current/deploy/server/update.sh" /usr/local/bin/xiaozao-update
else
  echo "健康检查失败，最近日志："
  journalctl -u howtocook -n 50 --no-pager || true
  if [[ -n "$PREV" && -d "$PREV" ]]; then
    echo "==> 切回 $(basename "$PREV")"
    switch_to "$PREV"
  fi
  exit 1
fi

# 只保留最近 3 个版本
ls -1d "$BASE"/releases/*/ | sed 's|/$||' | sort | head -n -3 | while read -r old; do
  [[ "$old" == "$(readlink -f "$BASE/current")" ]] || rm -rf "$old"
done
