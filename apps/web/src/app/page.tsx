const observationLenses = [
  {
    index: "01",
    label: "公开披露",
    detail: "从公告、财报与机构公开材料开始，保留信息出处。",
  },
  {
    index: "02",
    label: "市场脉络",
    detail: "把分散变化放回时间线，区分事实、信号与解释。",
  },
  {
    index: "03",
    label: "持续回看",
    detail: "记录观察时点与后续变化，让判断可以被重新检视。",
  },
] as const;

export default function HomePage() {
  return (
    <main className="market-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            火
          </span>
          <div>
            <p className="eyebrow">PUBLIC MARKET NOTES</p>
            <h1>火球</h1>
          </div>
        </div>
        <p className="edition">观察台 · 第 00 期</p>
      </header>

      <section className="lead" aria-labelledby="lead-title">
        <div className="lead-copy">
          <p className="section-label">今日开场</p>
          <h2 id="lead-title">让公开信息形成可回看的市场脉络。</h2>
          <p className="lead-summary">公开市场信息的观察与整理</p>
        </div>

        <aside className="market-key" aria-label="市场颜色说明">
          <p>市场颜色</p>
          <div className="key-row">
            <span className="key-item key-item-up">
              <span aria-hidden="true" />
              上涨
            </span>
            <span className="key-item key-item-down">
              <span aria-hidden="true" />
              下跌
            </span>
          </div>
          <small>颜色只用于标记公开市场的方向变化。</small>
        </aside>
      </section>

      <section className="notebook" aria-labelledby="notebook-title">
        <div className="notebook-heading">
          <p className="section-label">观察方法</p>
          <h2 id="notebook-title">三层信息笔记</h2>
        </div>

        <ol className="lens-list">
          {observationLenses.map((lens) => (
            <li key={lens.index}>
              <span className="lens-index" aria-hidden="true">
                {lens.index}
              </span>
              <div>
                <h3>{lens.label}</h3>
                <p>{lens.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="shell-footer">
        <span>HQ / ALPHA</span>
        <p>从可验证的公开资料出发。</p>
      </footer>
    </main>
  );
}
