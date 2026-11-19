import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

// 隐私政策（PRD 第 7、8 节，技术方案第 12 节）。内容与实际实现一致，改功能时同步更新。
export const metadata: Metadata = { title: "隐私政策", description: "小灶收集哪些数据、怎么用、怎么删。" };

const UPDATED = "2026-11-19";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2.5 font-serif text-h1 font-black">{title}</h2>
      <div className="space-y-2.5 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  const contact = process.env.CONTACT_EMAIL;
  return (
    <article className="pb-16">
      <h1 className="font-serif text-display font-black">隐私政策</h1>
      <p className="mt-1 text-small text-text-muted">更新于 {UPDATED}</p>
      <p className="mt-4">
        小灶是一个帮你决定“今天做什么、怎么做”的小工具。我们只收集让它好用所必需的数据，不卖数据，不做广告，不把你的身份信息发给 AI 模型。
      </p>

      <Section title="我们保存什么">
        <ul>
          <li>
            <strong>账号</strong>：邮箱、显示名；用 Google 登录时还有 Google 账号的唯一编号。登录验证码和会话令牌只保存哈希值。
          </li>
          <li>
            <strong>你填写的偏好</strong>：忌口与过敏、厨具、常备调料、口味描述、单位设置。
          </li>
          <li>
            <strong>使用记录</strong>：推荐记录、生成的教程、收藏、评价、追问，以及每天的用量计数（用来执行每日额度）。
          </li>
          <li>
            <strong>运行数据</strong>：每次调用 AI 的用量与花费（用于控制成本），功能使用事件（例如生成了教程、进入了烹饪模式，用于统计产品指标），以及服务器的访问日志（含 IP 地址，用于排查故障和防止滥用）。
          </li>
          <li>
            <strong>邀请码申请</strong>：如果你申请过邀请码，会保存你填写的邮箱和说明。
          </li>
        </ul>
        <p>
          <strong>食材照片不保存。</strong>拍照识别时，照片在你的设备上缩小后发给 AI 模型服务商识别食材，服务器只在内存中转发，不写入数据库、文件或日志。
        </p>
      </Section>

      <Section title="怎么用">
        <ul>
          <li>给你推荐菜、生成教程、回答追问。</li>
          <li>
            发给 AI 模型的只有做菜需要的信息：食材、口味、场景，以及一段偏好摘要（例如“对花生过敏；不吃香菜；有烤箱”）。
            <strong>不含邮箱、姓名或任何能识别你的信息。</strong>
          </li>
          <li>控制每日额度和全站成本、发现异常用量。</li>
          <li>发送登录验证码和邀请邮件。我们不发营销邮件。</li>
        </ul>
      </Section>

      <Section title="和谁共享">
        <p>只交给以下服务商，用于完成上面列出的用途：</p>
        <ul>
          <li>
            <strong>OpenAI</strong>：生成推荐、教程、回答追问、识别照片、画菜品示意图。请求设置为不保存（store: false）。
          </li>
          <li>
            <strong>Resend</strong>：发送登录验证码和邀请邮件（会处理你的邮箱地址）。
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong>：登录和申请时做真人验证，防止机器人。
          </li>
          <li>
            <strong>Google</strong>：仅在你选择用 Google 登录时，用来确认你的邮箱。
          </li>
        </ul>
        <p>网站和数据库运行在我们自己管理的服务器上（Google Cloud 新加坡机房）。除法律要求外，不向其他任何人提供你的数据。</p>
      </Section>

      <Section title="你可以做什么">
        <ul>
          <li>
            <strong>关掉记录</strong>：口味、厨具、常备调料、历史、评价每一类都可以单独关闭，关闭后不再记录，也不再用于推荐；关闭时可以选择同时删除已有的这类数据。忌口与过敏关系到安全，只要填写了就会使用。
          </li>
          <li>
            <strong>导出</strong>：随时把偏好、历史、教程、评价和追问导出成一个 JSON 文件。
          </li>
          <li>
            <strong>删除</strong>：一键删除全部个性化数据和教程。为防止绕过额度，当天的用量计数会保留到第二天。
          </li>
          <li>
            <strong>注销</strong>：删除账号和所有关联数据。花费记录和使用事件会去掉与你的关联，只保留匿名的统计。
          </li>
        </ul>
        <p>
          这些都在登录后的
          <Link href="/me/privacy" className="font-bold text-primary underline underline-offset-2">
            「我的 → 数据与隐私」
          </Link>
          里。
        </p>
      </Section>

      <Section title="保存多久与安全">
        <ul>
          <li>数据保存到你删除或注销为止。删除后，数据库每日备份里的副本最多再保留 14 天。</li>
          <li>全站使用 HTTPS；数据库只在服务器本机访问；密钥只保存在服务器上。</li>
          <li>收藏和打开过的教程会在你的设备上存一份，方便离线做菜；删除数据或注销时会一并清除。</li>
        </ul>
      </Section>

      <Section title="其他">
        <ul>
          <li>小灶只面向成年人，邀请制注册。</li>
          <li>教程由 AI 生成，过敏与饮食禁忌请自行确认。</li>
          <li>本政策变化时，会更新本页顶部的日期。</li>
        </ul>
        <p>
          有问题或想行使上面的权利但找不到入口，
          {contact ? (
            <>
              请发邮件到{" "}
              <a href={`mailto:${contact}`} className="font-bold text-primary underline underline-offset-2">
                {contact}
              </a>
              。
            </>
          ) : (
            "请联系邀请你的人转告管理员。"
          )}
        </p>
      </Section>
    </article>
  );
}
