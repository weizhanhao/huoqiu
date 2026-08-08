import Link from "next/link";

export default function AdminHomePage() {
  return (
    <main className="admin-shell">
      <header className="admin-brand" aria-label="火球内部工作区">
        <span aria-hidden="true">火</span>
        <p>火球</p>
      </header>

      <section className="entry-card" aria-labelledby="entry-title">
        <p className="eyebrow">HUOQIU INTERNAL</p>
        <h1 id="entry-title">员工审核入口</h1>
        <p className="entry-note">需要公司身份验证后才能继续。</p>
        <Link className="entry-action" href="/moderation">
          验证员工身份
        </Link>
      </section>
    </main>
  );
}
