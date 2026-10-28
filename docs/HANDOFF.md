# 火球项目交接 · 换电脑继续使用

核对日期：2026-10-28。本文面向接手开发和维护的人，所有命令均注明执行位置；不包含真实密码、私钥或会话密钥。

## 1. 先认准代码和服务

| 项目         | 当前状态                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| GitHub       | <https://github.com/weizhanhao/huoqiu>，公开仓库                               |
| 开发主分支   | `master`；换电脑后以 `git rev-parse HEAD` 查看实际版本                         |
| 最新产品基线 | `4ae574b8f0a305109973d88e4f2afb1aa60c999c`，当前服务器运行此产品版本           |
| 后续文档提交 | `5e08987` 加入单文件数据导图；本交接文档会产生更新的提交，不代表服务器同步发布 |
| 公网试用     | <http://114.55.171.64/>，用户选择先用 IP/HTTP 试用                             |
| 同机内网 IP  | `172.25.93.142`；本次实际通过公网 IP 连接                                      |
| 数据逻辑说明 | [单文件 HTML 数据导图](data-map/index.html)，下载该文件即可离线分享            |

当前可用主线是 **Next.js Web + Web 内置 API + JSON 文件持久化**。仓库还保留 Nest API、Admin、Mobile 和基础设施包，但启动当前 Web 不需要先启动它们，也不要求先装 PostgreSQL、Valkey 或 Docker。不要把仓库根目录的 `pnpm dev` 当作本版本最短启动路径。

代码、业务数据、凭证是三份独立的东西：GitHub 只包含代码与文档；拉代码不会复制云端账号、帖子、图片或登录权限。新电脑首次本地运行是一个独立环境。

## 2. 新电脑：先拉代码

需要 Git、Node.js **24.15.0** 和 pnpm **11.4.0**。仓库的 `.nvmrc`、`package.json` 是版本依据；不要使用系统自带 Node 22 启动本项目。

下面的命令适用于 macOS / Linux 的 Bash 或 Zsh；Windows 可在 WSL 中执行。先安装好 nvm，再执行：

```bash
git clone --branch master https://github.com/weizhanhao/huoqiu.git
cd huoqiu
nvm install
nvm use
npm install --global pnpm@11.4.0
node --version
pnpm --version
pnpm install --frozen-lockfile
```

不要复用旧电脑的 `node_modules` 或 `.next`，由新电脑按锁文件安装并重新构建。只需要克隆 `master`；旧电脑的多个工作树不是运行依赖，不必全部复制。

若后续需要提交到 GitHub，可使用 GitHub CLI：

```bash
gh auth login --git-protocol ssh
git remote set-url origin git@github.com:weizhanhao/huoqiu.git
ssh -T git@github.com
```

按提示为 GitHub 授权新电脑的 SSH 公钥。`ssh -T` 显示成功认证但“不提供 shell”是正常结果，退出码可能是 1。GitHub 的密钥和云服务器的登录授权需要分别配置。本次 HTTPS 推送曾因 OAuth 缺少 `workflow` 权限被拒绝，最终使用已授权 SSH 成功；仓库的两个 CI 工作流已完整保留。

## 3. 新电脑：创建独立的本地配置

在仓库根目录执行以下初始化，**只执行一次**。它创建被 Git 忽略的 `.runtime/`，生成本机密码和会话密钥，已有配置时会拒绝覆盖。

```bash
node --input-type=module <<'NODE'
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const runtime = resolve('.runtime');
mkdirSync(runtime, { recursive: true, mode: 0o700 });
const config = {
  APP_ENV: 'local',
  PREVIEW_BASIC_USERNAME: 'huoqiu-local',
  PREVIEW_BASIC_PASSWORD: randomBytes(20).toString('hex'),
  HUOQIU_SESSION_SECRET: randomBytes(32).toString('hex'),
  HUOQIU_SOCIAL_STORE_DIRECTORY: resolve(runtime, 'social'),
  HUOQIU_FINANCE_SNAPSHOT_DIRECTORY: resolve(runtime, 'finance'),
  HUOQIU_MARKET_CACHE_DIRECTORY: resolve(runtime, 'market-cache'),
};
for (const key of [
  'HUOQIU_SOCIAL_STORE_DIRECTORY',
  'HUOQIU_FINANCE_SNAPSHOT_DIRECTORY',
  'HUOQIU_MARKET_CACHE_DIRECTORY',
]) mkdirSync(config[key], { recursive: true, mode: 0o700 });
writeFileSync(resolve(runtime, 'local-preview.env'),
  Object.entries(config).map(([key, value]) =>
    `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
  { flag: 'wx', mode: 0o600 });
console.log('本地配置已创建：.runtime/local-preview.env');
NODE
```

此文件不是根目录 `.env.example` 的替代模板：后者主要面向另外的 API/基础设施主线。当前 Web 站内注册与登录依赖 `HUOQIU_SESSION_SECRET`，缺失时不能正常建立会话。保留同一份本地密钥，避免每次启动都让原有登录失效。

本地配置使用绝对数据路径。若之后移动了项目目录，更新这三个目录配置；不要重新生成并覆盖已有业务数据。

## 4. 新电脑：构建和启动 Web

在仓库根目录执行：

```bash
pnpm --filter @huoqiu/web build
PREVIEW_PRODUCT_SHA="$(git rev-parse HEAD)" pnpm preview:stamp
PREVIEW_PRODUCT_SHA="$(git rev-parse HEAD)" \
PREVIEW_GATEWAY_SHA="$(git rev-parse HEAD)" \
node --env-file=.runtime/local-preview.env apps/preview/scripts/start-local.mjs
```

看到 `PREVIEW_READY` 后，打开 <http://127.0.0.1:4173/>。保持这个终端运行，`Ctrl+C` 停止本次预览。网关只监听 `127.0.0.1:4173`，内部 Web 监听 `127.0.0.1:4174`。

**本地会保留浏览器访问保护弹窗**。用户名为 `huoqiu-local`，密码是刚生成的本机随机值。可以在另一终端、仓库根目录执行下面命令，仅在自己的屏幕上查看：

```bash
node --env-file=.runtime/local-preview.env -p 'process.env.PREVIEW_BASIC_PASSWORD'
```

通过本地访问保护后，在网页里注册站内账号。这个账号与云端账号独立。公网入口已按用户要求去掉浏览器弹窗，使用站内账号登录；不要因此删除本地网关的访问保护。

端口已占用时，在启动命令最后加 `--port 4573 --web-port 4574`，打开 <http://127.0.0.1:4573/>。不要结束用途不明的旧服务来抢占端口。

后续更新的顺序：停止本地预览 → `git pull --ff-only origin master` → 如依赖变更则 `pnpm install --frozen-lockfile` → 重新构建 → 重新 stamp → 启动。构建、stamp 和启动的 SHA 必须一致；不要在服务运行时覆盖它正在使用的 `.next`。

### 启动失败时先看这里

| 表现                            | 优先检查                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| `PREVIEW_CONFIGURATION_INVALID` | 两个完整 40 位 SHA、Basic 配置、端口和 `APP_ENV=local`                     |
| `PREVIEW_BUILD_MISSING`         | 是否成功构建、stamp；是否拉代码后只更新了 SHA 却没重新构建                 |
| `PREVIEW_START_FAILED`          | 端口占用、Node 版本、子进程错误；不要直接绕过网关裸启 Web                  |
| 页面能开，站内登录不成功        | 是否设置并持久保留 `HUOQIU_SESSION_SECRET`，浏览器是否残留另一个环境的会话 |
| `Request rejected`              | 是否直接访问了内部 Web 端口；用网关入口并检查 Zero Trust 配置              |
| 行情或内容为空                  | 区分上游不可用与本地缺快照，继续看第 5 节；不能用虚构数据填空              |

更多网关约定见 [apps/preview/README.md](../apps/preview/README.md)。

## 5. 本地数据从哪里来，怎样更新

新电脑不会从 Git 自动恢复运行时快照。行情、基金、快讯等多数模块按访问或页面轮询向上游取数；资讯归档、小型历史图等依赖文件快照，首次启动可以为空。完整模块说明见 [HTML 数据导图](data-map/index.html)。

| 内容                       | 当前机制与注意事项                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| 公开资讯归档               | 读 `public-v1.json`；目前单次采集脚本只采 SEC，服务器现存快照生成于北京时间 2026-08-13 05:04 |
| 小图历史日线               | 读 `kline-v1.json`；单次脚本采 8 组标的，服务器文件于 2026-10-28 更新                        |
| 参考汇率                   | 读编译进 Web 的 `fx-snapshot.generated.ts`；脚本同时更新 JSON 与该源码，必须重新构建才能生效 |
| 社区、自选、组合、模拟交易 | 用户操作后写 JSON，保存在 `HUOQIU_SOCIAL_STORE_DIRECTORY`，不在 Git 中                       |

如需手动更新本地汇率与日线，使用同一份环境配置，**在 `apps/web` 目录执行脚本**：

```bash
cd apps/web
node --env-file=../../.runtime/local-preview.env scripts/fetch-fx-rates.mjs
node --env-file=../../.runtime/local-preview.env scripts/fetch-kline.mjs
cd ../..
```

其中汇率脚本会修改受 Git 管理的生成源码；更新后检查 `git diff`，停止预览并重新构建、stamp、启动。不能把“JSON 文件新了”当成“网页汇率新了”。

如需 SEC 归档，在本机私有配置文件中另行设置真实运营方 `SEC_EDGAR_OPERATOR` 与可联系邮箱 `SEC_EDGAR_CONTACT_EMAIL`，然后执行：

```bash
cd apps/web
node --env-file=../../.runtime/local-preview.env --import tsx scripts/fetch-finance-public.ts
cd ../..
```

以上均为**执行一次的脚本**，不自动安装调度。服务器目前仅配置每日业务数据备份，没有 SEC、汇率、日线或行情的后台采集定时器。页面轮询间隔、服务端缓存有效期、第三方发布时间是三个不同概念。

## 6. 换电脑接管现有服务器

公网服务可以直接在浏览器使用，不需要先启动本地项目。要维护服务器，新电脑还需要由管理员授权的 SSH 身份；GitHub 仓库不包含服务器密码、私钥和运行环境文件。

```bash
ssh -p 22 root@114.55.171.64
```

旧电脑已验证默认 SSH 身份可以连接。新电脑可从受控密码管理器安全迁移已有身份，或生成新密钥并由旧电脑/云控制台给服务器添加**公钥**。若出现 `Permission denied (publickey)`，先补授权，不要重置业务数据或把私钥传进仓库。

### 已核对的服务器布局

| 项目                     | 路径或状态                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 系统                     | Alibaba Cloud Linux 4，x86_64                                                         |
| 服务用户                 | `huoqiu`                                                                              |
| 当前代码入口             | `/opt/huoqiu/current` → `/opt/huoqiu/releases/4ae574b-20261028`                       |
| Node                     | `/opt/huoqiu/toolchain/node/bin/node`，24.15.0；系统另有 Node 22，不要混用            |
| pnpm CLI                 | `/opt/huoqiu/toolchain/pnpm/node_modules/pnpm/bin/pnpm.cjs`，11.4.0；用上述 Node 执行 |
| Web 服务                 | `huoqiu.service`，开机自启；网关 4173、Web 4174，均只监听回环                         |
| 入口代理                 | Caddy；公共 IP 80 端口，保留服务器已有的其他站点                                      |
| 私有运行配置             | `/etc/huoqiu/runtime.env`，`root:huoqiu 0640`                                         |
| 内部代理凭据             | `/etc/caddy/huoqiu-upstream.auth`，`root:caddy 0640`；由 Caddy 内部使用               |
| 社区/账号/上传/组合/委托 | `/var/lib/huoqiu/social`                                                              |
| 公开快照                 | `/var/lib/huoqiu/finance`                                                             |
| 行情磁盘缓存             | `/var/lib/huoqiu/market-cache`                                                        |
| 部署元数据               | `/opt/huoqiu/deployment.json`，不含密钥                                               |

下面都是在 **SSH 进入服务器之后**执行的检查命令：

```bash
systemctl status huoqiu.service huoqiu-backup.timer --no-pager
systemctl is-enabled huoqiu.service huoqiu-backup.timer
systemctl list-timers huoqiu-backup.timer --all --no-pager
journalctl -u huoqiu.service -n 100 --no-pager
journalctl -u huoqiu-backup.service -n 30 --no-pager
readlink -f /opt/huoqiu/current
```

仅需重启现有版本时执行 `systemctl restart huoqiu.service`，之后检查状态及公网网页。不要在排障输出里打印 `runtime.env`、Caddy 凭据文件或浏览器会话头。

### 服务器升级的边界

`git push` **不会自动部署这台服务器**。当前代码按 release 目录部署，不应假定服务器有可直接 `git pull` 的工作仓库。

仓库已提供 `pnpm --filter @huoqiu/web build:release` 和 `scripts/release/activate-web-build.sh`：前者在 `.next-release` 构建候选，后者切换构建。接手人必须先确认本次发布的源码、目录权限、私有环境及目标 SHA，并先做业务数据备份。

需要在现有代码目录内重建时，流程是：用 `huoqiu` 用户和 Node 24 / pnpm 11 加载受保护运行配置 → 构建 `.next-release` → 用候选对应完整 SHA stamp → 核查后激活。**现有布局必须显式传入当前代码目录**：

```bash
# 在服务器上；仅在候选构建、stamp、配置核对全部完成后执行
sudo /opt/huoqiu/current/scripts/release/activate-web-build.sh /opt/huoqiu/current
```

这个脚本默认参数 `/opt/huoqiu` 与当前 release 布局不同；脚本本身也不会同步 `runtime.env` 中的版本 SHA。因此它不是跨版本部署的一键命令。换源码版本时，需一并协调 release 路径、候选 stamp 与运行配置中的产品/网关 SHA；切勿只改其中一个。启动失败时脚本会尝试恢复上一份构建，但这不能替代发布后的 HTTP、登录和数据验证。

首次部署的本地打包目录与凭证不在 Git 中；可根据本节服务器实存文件接管，不依赖旧电脑的绝对路径。不要在运行中的 `.next` 上直接执行普通 `next build`，也不要覆盖 `/var/lib/huoqiu`。

## 7. 备份与换机恢复

服务器已安装 `huoqiu-backup.timer`，每日执行并带最多 15 分钟随机延迟；脚本是 `/opt/huoqiu/ops/backup-social.py`，备份存放于 `/var/backups/huoqiu/social-*.tar.gz`。

```bash
# 在服务器上：手动做一份业务备份，并检查执行结果
systemctl start huoqiu-backup.service
journalctl -u huoqiu-backup.service -n 30 --no-pager
ls -lh /var/backups/huoqiu/social-*.tar.gz
```

备份服务是一次性任务，执行完显示 `inactive` 正常；应检查退出结果与新归档是否存在。已核对的归档包含有效 `social/social-v1.json`。

**这不是整机恢复包**：自动归档仅包含 `/var/lib/huoqiu/social`，不包含公开快照、行情缓存、代码构建、systemd 配置、Caddy 配置、运行环境或密钥。若要迁移整台服务器，需要另外受控保存这些配置与公开快照。运行密钥应通过密码管理器或加密渠道交接，不进入公开 Git。

恢复业务数据前先停服务、保留目标目录现状，把归档解压到独立临时目录核验，再恢复到正确路径并设置 `huoqiu` 用户权限，最后启动并验证。不要把包含顶层 `social/` 的归档直接解压进现有 `social/` 导致多嵌套一层，也不要在服务写入时覆盖 JSON。

只在新电脑开发时，不必复制云端真实业务数据；本地 `.runtime/` 和本机环境配置也需自行备份。若确实复制了业务数据，使用独立环境，并通过受控渠道传输，避免提交或再发布用户内容。

## 8. 已知问题与接手优先级

- **汇率时效**：服务器采集文件和生成源码已更新至 2026-10-27，但正在运行的构建仍展示 2026-08-12 的编译值，尚需一次受控重建/发布。
- **刷新语义**：顶部指数 6 秒是轮播，成功结果在浏览器模块缓存中没有到期时间；标的报价/指标/最近成交约每 30 秒请求，当前主分时/K 线图没有自动轮询。
- **采集调度**：没有已启用的后台采集定时器；不要把历史规划中的 SEC 每 5 分钟、新闻每 15 分钟等目标当成当前运行事实。
- **来源与覆盖**：SEC 快照陈旧；主图部分海外市场/周期不可用；第三方接口失败、延时或返回不全时应保留真实状态，不能补假行情、假新闻或假收益。
- **产品范围**：当前是可试用 Web，仍带保守的 `synthetic` / `unreviewed` 网关标记。页面中已有真实上游数据，不能把所有内容一概当作固定合成数据；也不能因此声称已完成全功能生产验收。模拟交易只存委托并推导持仓，没有现金余额管理或真实券商下单。
- **入口**：当前公网是用户选择的 HTTP/IP 临时试用入口；域名/HTTPS 尚未为此入口配置。浏览器弹窗取消后，站内私有接口仍要求网页登录。

后续交付优先用户能看到并操作的 Web 页面与业务闭环，保持超过 80% 的工作集中在 Web 交付。涉及金额、业务语义或架构范围的重要未决问题先澄清；明确的小切片直接实施。新功能经过独立复核和桌面/移动浏览器验证后再进入稳定预览。保留已有工作树、运行进程和用户文件；不自动清理、不批量安装重复依赖、不自动提交凭证。

改代码时按范围验证，例如 `pnpm --filter @huoqiu/web typecheck`、相关测试与 `pnpm --filter @huoqiu/web build`。跨模块改动再跑根目录 `pnpm lint`、`pnpm typecheck`、`pnpm test` 和 `pnpm build`。这些是接手后的验证入口，不代表本次文档交接重新执行了整套构建。

## 9. 给下一位协作者的开场说明

可以把下面这段连同仓库地址发给后续协作者：

> 这是火球项目，请先读 `docs/HANDOFF.md`、`README.md` 和相关目录的 `AGENTS.md`，再开始工作。使用 GitHub 的 `master`；当前云端产品基线为 `4ae574b`，后续文档提交不代表已发布。先检查 Git 状态和现有服务，不覆盖用户文件或运行中的 `.next`。优先完成用户可见的 Web 业务闭环，保留所有工作树和既有服务。代码、业务数据、凭证分离，禁止把 `.runtime/`、`.env`、私钥、账号备份或服务器凭据提交到仓库。本文列出的已知问题尚未因写文档而修复；先按实际来源核对，再决定本次改动和验证范围。
