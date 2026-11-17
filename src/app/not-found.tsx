import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <h1 className="text-h1 font-bold">没找到这个页面</h1>
      <p className="mt-2 text-text-muted">链接可能已经失效。</p>
      <ButtonLink href="/" className="mt-6">
        回到首页
      </ButtonLink>
    </>
  );
}
