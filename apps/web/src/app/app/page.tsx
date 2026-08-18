import type { Metadata } from "next";

/*
 * 手机端扫码页。
 *
 * 二维码指向跑在本机（172.29.98.11）上的 Expo 打包服务器，不是某个人的笔记本
 * ——此前那版二维码写的是开发机的局域网地址，开发机一换网段，扫出来就是
 * 「network connection was lost」，而二维码本身看不出任何问题。
 *
 * 内容是固定的（主机和端口都不会变），所以二维码直接以静态路径内联，不引
 * 任何前端库，也不需要在浏览器里现算。
 */

export const metadata: Metadata = {
  description: "用 Expo Go 扫码打开火球 App 预览版",
  title: "火球 App 预览",
};

const BUNDLER = "exp://172.29.98.11:8081";
const STATUS = "http://172.29.98.11:8081/status";

/* 由 qrcode 生成的 33×33 模块矩阵，内容就是上面那个 BUNDLER 地址。 */
const QR_PATH =
  "M4 4.5h7m1 0h1m3 0h1m1 0h1m1 0h1m1 0h7M4 5.5h1m5 0h1m3 0h1m1 0h1m1 0h1m3 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h2m1 0h2m1 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m2 0h1m3 0h1m1 0h1m2 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m2 0h2m2 0h2m3 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h1m1 0h2m4 0h1m1 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M13 11.5h1m1 0h1M4 12.5h1m1 0h1m3 0h2m1 0h1m2 0h3m1 0h1m2 0h1m2 0h1m1 0h1M4 13.5h1m1 0h1m1 0h2m3 0h3m1 0h1m2 0h3m1 0h1m2 0h2M5 14.5h1m2 0h1m1 0h1m1 0h4m4 0h3m2 0h2m1 0h1M4 15.5h2m2 0h2m1 0h1m2 0h1m1 0h2m1 0h1m2 0h2M7 16.5h1m1 0h2m2 0h1m2 0h2m1 0h4m2 0h1m1 0h1M6 17.5h2m1 0h1m3 0h2m1 0h1m3 0h2m1 0h2m2 0h2M4 18.5h3m1 0h3m1 0h3m1 0h3m1 0h2m1 0h4m1 0h1M7 19.5h3m1 0h3m1 0h2m1 0h1m2 0h3m2 0h2M4 20.5h5m1 0h1m1 0h3m2 0h2m1 0h6m2 0h1M12 21.5h1m1 0h1m2 0h4m3 0h2m2 0h1M4 22.5h7m1 0h1m1 0h2m3 0h2m1 0h1m1 0h1m3 0h1M4 23.5h1m5 0h1m2 0h1m3 0h1m1 0h2m3 0h5M4 24.5h1m1 0h3m1 0h1m4 0h3m2 0h6m1 0h2M4 25.5h1m1 0h3m1 0h1m2 0h2m1 0h1m2 0h4m2 0h1M4 26.5h1m1 0h3m1 0h1m1 0h2m2 0h4m3 0h2m2 0h2M4 27.5h1m5 0h1m3 0h3m1 0h3m3 0h3M4 28.5h7m1 0h1m1 0h1m2 0h4m2 0h2m3 0h1";

export default function AppPreviewPage() {
  return (
    <main className="app-preview">
      <h1>火球 App 预览</h1>
      <p className="app-preview-lede">
        用 <strong>Expo Go</strong> 里的扫一扫扫下面这个码（不是系统相机）。
      </p>

      <div className="app-preview-card">
        <svg
          aria-label={`扫码地址 ${BUNDLER}`}
          className="app-preview-qr"
          role="img"
          shapeRendering="crispEdges"
          viewBox="0 0 33 33"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect fill="#ffffff" height="33" width="33" />
          <path d={QR_PATH} stroke="#000000" />
        </svg>
        <code className="app-preview-url">{BUNDLER}</code>
      </div>

      <ol className="app-preview-steps">
        <li>
          手机装好 <strong>Expo Go</strong>（App Store 搜 Expo Go）。
        </li>
        <li>手机连到能访问本站的网络——能打开这一页就说明已经连上了。</li>
        <li>用 Expo Go 扫码；扫不动就点 Enter URL manually，把上面那行敲进去。</li>
      </ol>

      <p className="app-preview-note">
        扫不出来时先测打包服务器在不在：用手机浏览器打开{" "}
        <a href={STATUS}>{STATUS}</a>，看到 packager-status:running 就是正常的。
      </p>
    </main>
  );
}
