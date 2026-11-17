import { ButtonLink, Card } from "@/components/ui";

export function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="text-h1 font-bold">{title}</h1>
      <Card className="mt-4 p-4">
        <p>{body}</p>
        <p className="mt-1 text-small text-text-muted">登录与账号功能即将开放。</p>
        <ButtonLink href="/explore" variant="secondary" className="mt-4">
          先去探索菜系
        </ButtonLink>
      </Card>
    </>
  );
}
