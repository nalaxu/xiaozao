# 部署说明

第一版部署在 Vercel，使用已有域名下的三级域名（技术方案第 1 节）。下面以 `xiaozao.example.com` 代指你选定的三级域名。

## M0 需要的步骤

M0 只有静态页面（首页、探索菜系），不需要数据库和任何密钥。

1. **推送代码到 GitHub**（私有仓库即可）。
2. **在 Vercel 导入仓库**：New Project → 选择该仓库。框架会自动识别为 Next.js；构建命令、输出目录都用默认值。Node.js 版本选 22。
3. **区域**：Project Settings → Functions → Region 选 Washington, D.C.（`iad1`），与 Neon 的 `us-east` 同区。
4. **环境变量**：M0 只需要 `APP_URL=https://xiaozao.example.com`。
5. **绑定三级域名**：Project Settings → Domains → 添加 `xiaozao.example.com`。然后在你的域名 DNS 里加一条记录：

   | 类型 | 名称 | 值 |
   |---|---|---|
   | CNAME | `xiaozao` | `cname.vercel-dns.com` |

   如果域名托管在 Cloudflare，这条记录的代理状态设为“仅 DNS”（灰色云朵），否则 Vercel 无法签发证书。
6. 等 Vercel 显示域名“Valid Configuration”，打开 `https://xiaozao.example.com` 检查首页与探索页。

## 后续阶段需要的服务

| 阶段 | 服务 | 要做的事 | 环境变量 |
|---|---|---|---|
| M1 | Neon | 建项目（区域 `us-east`），复制连接串；本地运行 `npm run db:migrate` 建表 | `DATABASE_URL` |
| M1 | Google Cloud | 创建 OAuth 客户端（Web），回调地址填 `https://xiaozao.example.com/api/auth/google/callback` 和 `http://localhost:3000/api/auth/google/callback` | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` |
| M1 | Cloudflare Turnstile | 新建站点，域名填三级域名和 `localhost` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` |
| M1 | Resend | 验证发信域名（在已有域名 DNS 中添加 Resend 给出的记录），建 API Key | `RESEND_API_KEY`、`MAIL_FROM` |
| M1 | — | 生成两个随机串：`openssl rand -hex 32` | `OTP_SECRET`、`CRON_SECRET` |
| M1 | — | 管理员邮箱 | `ADMIN_EMAILS` |
| M2 | OpenAI | 建 API Key，建议在 OpenAI 后台另设月度用量上限作为第二道保险 | `OPENAI_API_KEY` |
| M3 | Cloudflare R2 | 建存储桶并开启公开访问（自定义域名或 r2.dev 地址），建 API 令牌 | `R2_*`、`IMAGE_BASE_URL` |

## 数据库迁移

每次部署带有新迁移（`drizzle/` 下新增文件，例如 M3 的 `0001_*.sql`、M4 的 `0002_*.sql`）时，在本地 `.env.local` 临时填入线上 `DATABASE_URL` 运行一次 `npm run db:migrate`，用完删掉。先迁移、再部署代码。

## M3：图片库

1. **R2**：Cloudflare 后台 → R2 → 新建存储桶（如 `xiaozao-images`）。在存储桶设置里开启公开访问：可以绑定已有域名下的子域名（如 `img.xiaozao.example.com`，需该域名托管在 Cloudflare），或先用 `r2.dev` 地址。
2. **API 令牌**：R2 → Manage API Tokens → 新建，权限选 Object Read & Write，范围限定这个存储桶。把 Account ID、Access Key ID、Secret Access Key 填进环境变量 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`，存储桶名填 `R2_BUCKET`，公开地址（不带结尾斜杠）填 `IMAGE_BASE_URL`。
3. **定时任务**：`vercel.json` 配置了每分钟调用一次 `/api/cron/tick`（接手遗漏或失败的图片任务、清理过期数据），Vercel 会自动带上 `CRON_SECRET`。**每分钟一次的定时任务需要 Vercel Pro**；Hobby 只允许每天一次，部署时会报错。Hobby 下可以把 `vercel.json` 的 `schedule` 改成 `0 3 * * *`（每天一次）：新图仍会在推荐后立即生成，只是失败重试要等到第二天。

## M4：离线与主屏幕

不需要新的服务或环境变量。Service Worker 只在生产构建注册，需要 HTTPS（Vercel 默认提供）。部署后用手机打开站点，浏览器菜单里“添加到主屏幕”即可；收藏的教程会自动存到手机上，没网也能打开和进入烹饪模式。

## M1 上线后创建第一位管理员

1. 在 Vercel 环境变量中设置 `ADMIN_EMAILS=你的邮箱`，重新部署。
2. 在本地 `.env.local` 中填入线上的 `DATABASE_URL`，运行建表与生成邀请码：

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run admin:invite
   ```

3. 打开线上站点，用 `ADMIN_EMAILS` 中的邮箱登录，填入刚生成的邀请码。注册完成后即为管理员，之后的邀请码都可以在 `/admin/invites` 生成。
4. 用完后从本地 `.env.local` 中删掉线上的 `DATABASE_URL`，避免本地开发误连线上库。

所有密钥只填在 Vercel 的环境变量和本地 `.env.local` 里，不提交到代码库。
