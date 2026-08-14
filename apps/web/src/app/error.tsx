"use client";

/*
 * 全站错误边界。
 *
 * 之前没有这个文件，任何渲染异常都会落到 Next 的英文默认错误页。
 *
 * 这里只展示 digest（一个可用于对照服务端日志的短标识），不展示
 * error.message —— 异常信息里可能带路径、字段名甚至凭据片段，
 * 那些东西不该出现在页面上。
 */
export default function RootError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section className="page-message" role="alert">
      <h1>这个页面没能加载出来</h1>
      <p>可以先重试一次。如果反复失败，说明是服务端的问题，重试不会有帮助。</p>
      {error.digest === undefined ? null : (
        <p className="page-message-digest">错误编号：{error.digest}</p>
      )}
      <div className="page-message-actions">
        <button onClick={reset} type="button">
          重试
        </button>
        <a href="/">回到首页</a>
      </div>
    </section>
  );
}
