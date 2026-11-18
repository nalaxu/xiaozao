#!/usr/bin/env bash
# 在服务器上以 root 运行一次（由 deploy/deploy.sh setup 调用）。可重复运行：已存在的数据库、环境变量文件不会被覆盖。
# 适用于 Ubuntu 22.04 / 24.04 / 26.10。不改动服务器上已有的服务（已有的 Caddy 站点、其他数据库等）。
set -euo pipefail

DOMAIN=${1:?缺少域名}
SRC=${2:?缺少部署文件目录}
[[ $(id -u) == 0 ]] || { echo "请用 root 运行"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> 检查 80/443 端口"
if ss -ltnp '( sport = :80 or sport = :443 )' | grep -v caddy | grep -q LISTEN; then
  ss -ltnp '( sport = :80 or sport = :443 )'
  echo "80 或 443 端口已被其他程序占用（见上），请先停掉它再运行。"
  exit 1
fi

echo "==> 安装系统软件"
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg rsync openssl postgresql postgresql-contrib \
  debian-keyring debian-archive-keyring apt-transport-https

if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  echo "==> 安装 Node.js 22"
  if ! { curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y -q nodejs; }; then
    echo "NodeSource 不可用，改用系统软件源里的 Node.js"
    apt-get install -y -q nodejs npm
  fi
fi

if ! command -v caddy >/dev/null; then
  echo "==> 安装 Caddy（自动申请和续期 HTTPS 证书）"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

if ! swapon --show | grep -q .; then
  echo "==> 添加 2G 交换空间（构建 Next.js 时防止内存不足）"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> 用户与目录"
id howtocook >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/howtocook --shell /usr/sbin/nologin howtocook
mkdir -p /opt/howtocook/releases /var/lib/howtocook/images /var/backups/howtocook /etc/howtocook
chown howtocook:howtocook /opt/howtocook /opt/howtocook/releases /var/lib/howtocook /var/lib/howtocook/images /var/backups/howtocook
chmod 750 /var/backups/howtocook

ENV_FILE=/etc/howtocook/env
if [[ ! -f $ENV_FILE ]]; then
  echo "==> 建数据库并生成环境变量文件 $ENV_FILE"
  DB_PASS=$(openssl rand -hex 24)
  if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='howtocook'" | grep -q 1; then
    sudo -u postgres psql -q -c "alter role howtocook with login password '$DB_PASS'"
  else
    sudo -u postgres psql -q -c "create role howtocook with login password '$DB_PASS'"
  fi
  sudo -u postgres psql -tAc "select 1 from pg_database where datname='howtocook'" | grep -q 1 \
    || sudo -u postgres psql -q -c "create database howtocook owner howtocook"

  sed -e "s|__DOMAIN__|$DOMAIN|g" \
      -e "s|__DB_PASS__|$DB_PASS|g" \
      -e "s|__OTP_SECRET__|$(openssl rand -hex 32)|g" \
      -e "s|__CRON_SECRET__|$(openssl rand -hex 32)|g" \
      "$SRC/deploy/server/env.template" > "$ENV_FILE"
  chown root:howtocook "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  NEW_ENV=1
else
  echo "==> $ENV_FILE 已存在，保留不动"
fi

echo "==> 服务、反向代理、定时任务"
install -m 644 "$SRC/deploy/server/howtocook.service" /etc/systemd/system/howtocook.service
systemctl daemon-reload
systemctl enable howtocook >/dev/null

# 站点配置单独放 /etc/caddy/howtocook.caddy，主 Caddyfile 里只加一行 import，不动服务器上已有的其他站点。
# 只有主 Caddyfile 还是安装包自带的默认欢迎页时才整个替换掉。
SITE=/etc/caddy/howtocook.caddy
MAIN=/etc/caddy/Caddyfile
sed "s|__DOMAIN__|$DOMAIN|g" "$SRC/deploy/server/Caddyfile" > "$SITE"
if [[ ! -f $MAIN ]] || grep -q '/usr/share/caddy' "$MAIN"; then
  [[ -f $MAIN ]] && cp "$MAIN" "$MAIN.bak-$(date +%Y%m%d%H%M%S)"
  echo "import $SITE" > "$MAIN"
elif ! grep -qx "import $SITE" "$MAIN"; then
  cp "$MAIN" "$MAIN.bak-$(date +%Y%m%d%H%M%S)"
  printf '\nimport %s\n' "$SITE" >> "$MAIN"
fi
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
caddy validate --config "$MAIN" --adapter caddyfile >/dev/null
systemctl enable caddy >/dev/null
# reload 是平滑的：新配置有错时 Caddy 保留旧配置继续运行
if systemctl is-active -q caddy; then systemctl reload caddy; else systemctl start caddy; fi

install -m 644 "$SRC/deploy/server/cron" /etc/cron.d/howtocook

if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443 >/dev/null
fi

echo
echo "服务器准备完成。"
if [[ ${NEW_ENV:-} == 1 ]]; then
  echo "下一步：sudo nano $ENV_FILE，填写 OPENAI_API_KEY、RESEND_API_KEY、MAIL_FROM、ADMIN_EMAILS 等（数据库、OTP/CRON 密钥已自动生成）。"
fi
echo "然后在本机运行：deploy/deploy.sh release <ssh目标>"
