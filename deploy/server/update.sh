#!/usr/bin/env bash
# 在服务器上运行：从 GitHub 拉取最新代码并让它生效。
#
#   xiaozao-update            拉取 main 分支最新提交并发布；已经是最新就什么都不做
#   xiaozao-update --force    即使已是最新也重新构建发布（例如改了 /etc/howtocook/env 里构建时读取的变量）
#
# 发布过程与 deploy/deploy.sh release 相同（release.sh）：安装依赖 → 数据库迁移 → 构建 → 切换 → 重启 → 健康检查，
# 失败自动切回原版本。用的是新拉下来的那份 release.sh，脚本本身的改进也会随之生效。
# 每次发布成功后会生成命令 /usr/local/bin/xiaozao-update（包装脚本，自动 sudo 运行本文件）。
# 仓库与分支可用环境变量覆盖：REPO_URL=... BRANCH=... xiaozao-update
set -euo pipefail

if [[ $(id -u) != 0 ]]; then
  exec sudo env REPO_URL="${REPO_URL:-}" BRANCH="${BRANCH:-}" bash "$(readlink -f "$0")" "$@"
fi

REPO_URL=${REPO_URL:-https://github.com/nalaxu/xiaozao.git}
BRANCH=${BRANCH:-main}
FORCE=0
[[ ${1:-} == --force ]] && FORCE=1

command -v git >/dev/null || { apt-get update -q && apt-get install -y -q git; }

echo "==> 查询 $REPO_URL 的 $BRANCH 分支"
remote=$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" | cut -c1-12)
[[ -n "$remote" ]] || { echo "找不到分支 $BRANCH"; exit 1; }
running=$(basename "$(readlink -f /opt/howtocook/current 2>/dev/null || echo none)")
running_sha=${running##*-}

if [[ "$remote" == "$running_sha" && $FORCE == 0 ]]; then
  echo "已经是最新版本（$remote），无需更新。要强制重新发布请加 --force。"
  exit 0
fi
echo "    线上版本：${running_sha:-无}  →  最新提交：$remote"

work=$(mktemp -d /var/tmp/howtocook-update.XXXXXX)
trap 'rm -rf "$work"' EXIT
git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$work/src"
sha=$(git -C "$work/src" rev-parse --short=12 HEAD)
rm -rf "$work/src/.git"

bash "$work/src/deploy/server/release.sh" "$work/src" "$sha"
