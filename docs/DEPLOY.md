# 部署说明

线上运行在自有 Ubuntu 服务器（新加坡，2 核 4G），域名 `xiaozao.alanxiang.top`（技术方案第 1 节）。

```
浏览器 ──HTTPS──▶ Caddy（自动证书；/images/* 直接读本机图片目录）
                    └──▶ Next.js（systemd 服务 howtocook，只监听 127.0.0.1:3000）
                              ├─ Postgres（本机，只监听 127.0.0.1）
                              ├─ OpenAI（OPENAI_BASE_URL）
                              └─ Resend（邮件）
crontab：每分钟 /api/cron/tick；每天 03:30 备份数据库和图片
```

所有脚本和配置在 `deploy/`：

| 文件 | 作用 |
|---|---|
| `deploy/deploy.sh` | 在本机运行的入口：`setup` / `release` / `rollback` / `invite` / `logs` |
| `deploy/server/setup.sh` | 首次初始化服务器（可重复运行） |
| `deploy/server/release.sh` | 发布与回滚 |
| `deploy/server/env.template` | 线上环境变量模板，生成到 `/etc/howtocook/env` |
| `deploy/server/howtocook.service` | systemd 服务 |
| `deploy/server/Caddyfile` | 反向代理、HTTPS、图片（装到 `/etc/caddy/howtocook.caddy`，主 Caddyfile 只追加一行 `import`，不影响服务器上已有的站点；每次发布时自动同步，校验不过则保留原配置）。Caddy 只接管 `/images/dishes/*`，`public/images` 里的界面图片仍由应用提供 |
| `deploy/server/cron`、`cron-tick.sh`、`backup.sh` | 定时任务与备份 |

服务器上的目录：

| 路径 | 内容 |
|---|---|
| `/opt/howtocook/releases/<时间>-<提交号>` | 各个版本（保留最近 3 个） |
| `/opt/howtocook/current` | 指向正在运行的版本 |
| `/etc/howtocook/env` | 环境变量（root 与 howtocook 用户可读，权限 640） |
| `/var/lib/howtocook/images` | 菜品图片 |
| `/var/backups/howtocook` | 每日备份 |

登录服务器的管理员账号（如 `alan`）在 `howtocook` 与 `systemd-journal` 组里：可以直接查看上面的目录和配置、直接 `journalctl -u howtocook` 看日志，不用 sudo；修改、重启、更新仍需 sudo，或直接运行 `xiaozao-update`（它会自己调用 sudo）。

## 一、首次上线

### 1. 准备

- 服务器：Ubuntu 22.04 / 24.04 / 26.10，能用 SSH 登录且有 sudo 权限。云厂商的安全组放行 **22、80、443** 端口。
- 本机能免密 SSH 到服务器（`ssh-copy-id ubuntu@<服务器IP>`）。下文用 `ubuntu@<服务器IP>` 代指。
- DNS：在 `alanxiang.top` 的 DNS 里加一条记录，等它生效（`dig +short xiaozao.alanxiang.top` 能返回服务器 IP）：

  | 类型 | 名称 | 值 |
  |---|---|---|
  | A | `howtocook` | 服务器公网 IP |

  如果域名托管在 Cloudflare，代理状态设为“仅 DNS”（灰色云朵）。开橙色云朵会让应用拿到的访客 IP 变成 Cloudflare 的，限流会失准。

### 2. 初始化服务器

```bash
deploy/deploy.sh setup ubuntu@<服务器IP> xiaozao.alanxiang.top
```

它会安装 Node.js 22、PostgreSQL、Caddy，加 2G 交换空间，建 `howtocook` 系统用户和上面的目录，建数据库，生成 `/etc/howtocook/env`（数据库密码、`OTP_SECRET`、`CRON_SECRET` 已自动生成），安装 systemd 服务、Caddyfile 和定时任务。80/443 端口被其他程序占用时会停下来提示。

### 3. 填写环境变量

```bash
ssh -t ubuntu@<服务器IP> sudo nano /etc/howtocook/env
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `OPENAI_API_KEY`、`OPENAI_BASE_URL` | 是 | 与本地 `.env.local` 相同 |
| `RESEND_API_KEY`、`MAIL_FROM` | 是 | 邮箱验证码、邀请和花费告警都靠它；没配置时线上发信会报错。`MAIL_FROM` 含空格要加双引号，如 `MAIL_FROM="小灶 <noreply@alanxiang.top>"` |
| `ADMIN_EMAILS` | 是 | 管理员邮箱，逗号分隔 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` | 是 | 线上不配置时发验证码、申请邀请码一律被拒（“真人验证没有通过”），无法登录；只有本地开发会跳过。站点密钥在构建时读取，改了要重新 `release` |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 否 | 不配置则登录页只显示邮箱登录 |
| `APP_URL`、`DATABASE_URL`、`IMAGE_DIR`、`IMAGE_BASE_URL`、`OTP_SECRET`、`CRON_SECRET` | — | 已自动填好，不用改 |

各服务的开通步骤见下文“第三方服务”。

### 4. 发布

```bash
deploy/deploy.sh release ubuntu@<服务器IP>
```

它会把**最后一次提交**（`git archive HEAD`，不含未提交的改动和 `.env.local`）上传为新版本，然后依次：`npm ci` → 数据库迁移 → 构建 → 切换 `current` → 重启 → 健康检查。健康检查失败会自动切回原版本。首次构建约 3–5 分钟。

打开 `https://xiaozao.alanxiang.top`，首次访问时 Caddy 会花几秒申请证书。

### 5. 创建第一位管理员

```bash
deploy/deploy.sh invite ubuntu@<服务器IP>
```

用 `ADMIN_EMAILS` 里的邮箱登录，填入刚生成的邀请码，注册完成后即为管理员。之后的邀请码都在 `/admin/invites` 生成。

## 二、日常操作

| 要做的事 | 命令 |
|---|---|
| 更新到 GitHub 上的最新代码 | 在服务器上运行 `xiaozao-update`（或在本机 `deploy/deploy.sh update ubuntu@<服务器IP>`）：拉取 `main` 最新提交 → 安装依赖 → 迁移 → 构建 → 切换 → 重启 → 健康检查，失败自动回滚；已是最新则跳过，`--force` 强制重新发布 |
| 发布本机的提交（不经过 GitHub） | 先提交，再 `deploy/deploy.sh release ubuntu@<服务器IP>` |
| 回滚到上一个版本 | `deploy/deploy.sh rollback ubuntu@<服务器IP>`（不回滚数据库迁移） |
| 看应用日志 | `deploy/deploy.sh logs ubuntu@<服务器IP>` |
| 生成邀请码 | `deploy/deploy.sh invite ubuntu@<服务器IP> [数量] [次数] [天数]` |
| 改环境变量 | 编辑 `/etc/howtocook/env` 后运行 `xiaozao-update --force`（`IMAGE_BASE_URL`、`NEXT_PUBLIC_*` 在构建时读取，只重启不生效） |
| 看访问日志 | 服务器上 `sudo tail -f /var/log/caddy/howtocook.log` |
| 看定时任务是否报错 | 服务器上 `journalctl -t howtocook-cron -t howtocook-backup` |
| 预生成菜品图片（花钱） | `deploy/deploy.sh seed-images ubuntu@<服务器IP> --batch 1 --limit 100`：读 `knowledge/dish-seed.yaml`，已有图的跳过，可中断后重跑续上；结束时打印张数、合计与平均成本。先加 `--dry-run` 看会生成哪些 |
| 评测与成本实测（花钱，约 $1–2） | `deploy/deploy.sh eval ubuntu@<服务器IP>`：跑 `evals/cases.yaml` 的 30 组用例和识别照片，报告取回本机 `evals/report-<日期>.md`。只跑几组：`--only c01,c02` |

**数据库迁移**：`release` 会先迁移再切换新代码。迁移需要与旧代码兼容（只加不删），回滚时不会撤销迁移。

## 三、备份与恢复

每天 03:30（服务器时区）把数据库导出为 `/var/backups/howtocook/db-<时间>.dump`（保留 14 天），并把图片同步到 `/var/backups/howtocook/images/`。

这只防误删和数据损坏，**不防整台服务器丢失**。建议任选其一：开启云厂商的磁盘快照（每天一次），或定期把备份目录拉到本机：

```bash
rsync -az ubuntu@<服务器IP>:/var/backups/howtocook/ ~/backups/howtocook/
```

从备份恢复数据库（会覆盖现有数据）：

```bash
sudo systemctl stop howtocook
sudo -u postgres pg_restore --clean --if-exists --no-owner --role=howtocook -d howtocook /var/backups/howtocook/db-<时间>.dump
sudo systemctl start howtocook
```

## 四、第三方服务

| 服务 | 要做的事 | 环境变量 |
|---|---|---|
| OpenAI（或兼容的中转） | 建 API Key；建议在后台另设月度用量上限作为第二道保险 | `OPENAI_API_KEY`、`OPENAI_BASE_URL` |
| Resend（免费档每月 3,000 封） | 验证发信域名 `alanxiang.top`（在 DNS 中添加 Resend 给出的 SPF/DKIM 记录），建 API Key | `RESEND_API_KEY`、`MAIL_FROM` |
| Cloudflare Turnstile（免费，线上必需） | Cloudflare 后台 → Turnstile → Add widget，Hostname 填 `xiaozao.alanxiang.top`（本地测试可再加 `localhost`），Widget Mode 选 Managed | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` |
| Google Cloud（免费） | 创建 OAuth 客户端（Web），回调地址填 `https://xiaozao.alanxiang.top/api/auth/google/callback` 和 `http://localhost:3000/api/auth/google/callback` | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` |

### 可选：改用托管服务

代码同时支持本机和托管两种方式，换的时候只改环境变量并重新发布：

- **数据库改用 Neon**：建项目时区域选 Singapore（`ap-southeast-1`），把 `DATABASE_URL` 换成 Neon 的连接串（主机名以 `neon.tech` 结尾时自动用 Neon 驱动）。用 `pg_dump`/`pg_restore` 迁移数据。
- **图片改用 Cloudflare R2**：建存储桶并开启公开访问，建 Object Read & Write 令牌，填 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`，把 `IMAGE_BASE_URL` 改成存储桶的公开地址。已有图片要用 `rclone` 等工具从 `/var/lib/howtocook/images` 复制过去（路径不变）。配置了 R2 时优先用 R2。

## 五、离线与主屏幕

Service Worker 只在生产构建注册，需要 HTTPS（Caddy 已提供）。用手机打开站点，在浏览器菜单里选“添加到主屏幕”；收藏的教程会自动存到手机上，没网也能打开和进入烹饪模式。
