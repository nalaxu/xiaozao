#!/usr/bin/env bash
# 在本机运行：把已提交的代码发布到自建服务器（docs/DEPLOY.md）。
#
#   deploy/deploy.sh setup    <ssh目标> <域名>   首次：装 Node 22、Postgres、Caddy，建用户、目录、数据库、环境变量模板、服务、定时任务
#   deploy/deploy.sh release  <ssh目标>          发布当前 HEAD：上传 → 安装依赖 → 数据库迁移 → 构建 → 切换 → 重启 → 健康检查（失败自动回滚）
#   deploy/deploy.sh update   <ssh目标> [--force] 让服务器自己从 GitHub 拉取 main 最新提交并发布（等同在服务器上运行 xiaozao-update）
#   deploy/deploy.sh rollback <ssh目标>          切回上一个版本
#   deploy/deploy.sh invite   <ssh目标> [数量] [次数] [天数]   在线上库生成邀请码
#   deploy/deploy.sh logs     <ssh目标>          跟踪应用日志
#
# <ssh目标> 例如 ubuntu@1.2.3.4，需能免密 sudo（或在提示时输入 sudo 密码）。
set -euo pipefail

cmd=${1:-}
host=${2:-}
[[ -n "$cmd" && -n "$host" ]] || { sed -n '2,11p' "$0"; exit 1; }
cd "$(dirname "$0")/.."

upload() {
  # 只上传已提交的文件（git archive），本机的 .env.local、.data、node_modules 不会被带上去
  local dest=$1
  ssh "$host" "rm -rf '$dest' && mkdir -p '$dest'"
  git archive --format=tar HEAD | ssh "$host" "tar -x -C '$dest'"
}

case "$cmd" in
  setup)
    domain=${3:?用法: deploy/deploy.sh setup <ssh目标> <域名>}
    tmp=/tmp/howtocook-setup
    upload "$tmp"
    ssh -t "$host" "sudo bash $tmp/deploy/server/setup.sh '$domain' '$tmp' && rm -rf '$tmp'"
    ;;
  release)
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "提示：有未提交的改动，发布的是最后一次提交（$(git rev-parse --short HEAD)），未提交的改动不会上线。"
    fi
    sha=$(git rev-parse --short=12 HEAD)
    tmp=/tmp/howtocook-$sha
    upload "$tmp"
    ssh -t "$host" "sudo bash $tmp/deploy/server/release.sh '$tmp' '$sha'"
    ;;
  update)
    ssh -t "$host" "sudo xiaozao-update ${3:-}"
    ;;
  rollback)
    ssh -t "$host" "sudo bash /opt/howtocook/current/deploy/server/release.sh --rollback"
    ;;
  invite)
    shift 2
    ssh -t "$host" "sudo -u howtocook bash -c 'cd /opt/howtocook/current && node --env-file=/etc/howtocook/env node_modules/tsx/dist/cli.mjs scripts/admin-invite.ts $*'"
    ;;
  logs)
    ssh -t "$host" "sudo journalctl -u howtocook -f -n 100"
    ;;
  *)
    sed -n '2,11p' "$0"
    exit 1
    ;;
esac
