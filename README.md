# 小灶

告诉它你想吃什么味道、手头有什么，它帮你挑几道菜，再带你做出来。

- 需求：[docs/PRD.md](docs/PRD.md)
- 技术方案：[docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)
- 设计：[docs/DESIGN.md](docs/DESIGN.md)
- 部署：[docs/DEPLOY.md](docs/DEPLOY.md)
- 知识库：[knowledge/README.md](knowledge/README.md)

## 本地开发

需要 Node.js 22。

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

打开 http://localhost:3000。`npm run dev` 和 `npm run build` 会先编译知识库（`npm run kb`）。

本地不需要任何外部服务：

- 未配置 `DATABASE_URL` 时使用本地 PGlite 数据库（`.data/pglite`，首次启动自动建表）。
- 未配置 Resend 时，验证码和邀请邮件打印在 `npm run dev` 的终端里。
- 未配置 Turnstile 时跳过真人验证；未配置 Google 时登录页只显示邮箱登录。
- 未配置 `OPENAI_API_KEY` 时使用假模型（`src/server/ai/fake.ts`）：拍照识别返回固定的几样食材，推荐从知识库的代表菜里挑，流程和界面都能走通，但结果不代表真实模型的质量。线上没有密钥会直接报错。
- 未配置 R2 时，菜品图写到 `.data/images`，经 `/api/dev-images` 读取；没有 OpenAI 密钥时图片是写着菜名的占位图。

本地注册第一个账号：在 `.env.local` 里写 `ADMIN_EMAILS=你的邮箱`，先停掉 dev 服务器，再运行 `npm run admin:invite` 生成邀请码（PGlite 同一时间只能被一个进程打开），然后启动 dev 服务器，用该邮箱登录并填入邀请码，这个账号就是管理员。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发 |
| `npm run build` | 生产构建 |
| `npm run kb` | 校验并编译知识库到 `src/generated/kb.json` |
| `npm run kb:check` | 只校验知识库 |
| `npm test` | 单元测试 |
| `npm run typecheck` | 类型检查 |
| `npm run lint` | 代码检查 |
| `npm run db:generate` | 根据 `src/server/db/schema.ts` 生成迁移 |
| `npm run db:migrate` | 把迁移应用到 `DATABASE_URL` 指向的数据库 |
| `npm run admin:invite -- [数量] [次数] [天数]` | 生成邀请码（读取 `.env.local` 的 `DATABASE_URL`，未配置则写本地库） |

## 目录

```
config/      模型、单价、额度与预算阈值
docs/        需求、技术方案、设计、部署
drizzle/     数据库迁移（生成后提交）
knowledge/   知识库 YAML（需终审才上线）
scripts/     知识库编译等脚本
src/app/     页面与接口
src/components/
src/lib/     前后端共用逻辑（知识库查询、食材归一）
src/server/  仅服务端代码（数据库等）
```
