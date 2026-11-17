// 发邮件（Resend）。本地开发未配置密钥时打印到服务端控制台。

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type MailSender = (mail: Mail) => Promise<void>;

export const sendMail: MailSender = async (mail) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY 未配置");
    console.info(`[mail:dev] → ${mail.to}\n${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`发信失败：${res.status}`);
};

export const otpMail = (to: string, code: string): Mail => ({
  to,
  subject: `小灶验证码：${code}`,
  text: `你的小灶验证码是 ${code}，10 分钟内有效，只能使用一次。\n\n如果不是你本人操作，忽略这封邮件即可。`,
});

export const inviteMail = (to: string, code: string, appUrl: string): Mail => ({
  to,
  subject: "你的小灶邀请码",
  text: `你申请的小灶邀请码是 ${code}，14 天内有效。\n\n打开 ${appUrl}/login 用这个邮箱登录，按提示填入邀请码即可完成注册。`,
});
