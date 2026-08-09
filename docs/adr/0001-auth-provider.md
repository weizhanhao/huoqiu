# ADR 0001: M1 身份提供者选择

- 状态：Accepted
- 日期：2026-08-09
- 决策范围：M1 员工封闭 Alpha 的身份提供者与 Web/App 传输边界
- 选中方案：Better Auth `1.6.26` + `@thallesp/nestjs-better-auth` `2.7.0`

## 背景

M1 需要在同一业务身份语义下支持 Web 的 HttpOnly Cookie 与 App 的
Bearer credential，同时保持 NestJS/Fastify 请求生命周期、可撤销状态会话和
移动端安全存储。身份 provider 的私有字段不得进入公共 contract、OpenAPI 或
生成 SDK。Keycloak OIDC Authorization Code + PKCE 是 Better Auth 硬门槛失败时
的唯一 fallback，不允许两套运行 route 并存。

## 决策

采用 Better Auth `1.6.26`，启用 email/password、stateful session 与
`bearer({ requireSignature: true })`。Nest 集成使用
`@thallesp/nestjs-better-auth` `2.7.0`，实际运行在
`@nestjs/platform-fastify` `11.1.28` 生命周期内。

- Web：仅接受 `__Secure-huoqiu.session_token`；属性必须包含
  `HttpOnly; Secure; SameSite=Lax; Path=/`，不设置 Domain。
- App：使用 Better Auth 签名 session token 作为 Bearer credential；token 只能
  交给 Mobile lane 的 SecureStore 抽象，不进入日志、普通持久化或公共 payload。
- 撤销：logout 删除当前 session；revoke-sessions 删除用户活动 session；旧
  Cookie/Bearer replay 返回空 session。
- Keycloak fallback 保持未选择状态，`spikes/auth/keycloak/probe.ts` 必须
  fail closed；运行系统不得注册 Keycloak route。

这是 provider 决策的 Accepted 状态，不等于绕过移动证据的发布认证。
`pnpm qa:auth-spike -- --provider better-auth` 固定执行 Root 真实探针、官方 npm
审计与 Mobile 精准测试；Mobile commit 合并前必须以
`AUTH_MOBILE_EVIDENCE_MISSING` 退出非零，合并后才允许 Task 0A 整体验收。

## 实测证据

### Root 五条实际能力与 provider 排他性

命令：

```bash
pnpm exec vitest run \
  spikes/auth/test/auth-provider.conformance.spec.ts \
  --no-file-parallelism
```

原始结果：`1 passed` test file，`6 passed` tests，零 skip。测试直接创建
内存 SQLite、执行 Better Auth migration、启动 Nest Fastify application，并用
Fastify `inject` 访问真实 auth middleware；不是字符串扫描或自报结果。覆盖：

1. 注册、登录、get-session、logout；
2. `HttpOnly + Secure + SameSite=Lax` Cookie；
3. 签名 Bearer token；
4. revoke-sessions 后 replay 为空；
5. Nest Fastify adapter 与 auth middleware lifecycle；
6. provider 排他性：Keycloak fallback 未被选择且 fail closed。

其中前五项是 Root 实际身份能力，第六项是防止双 provider route 的排他性约束；
它不替代计划中的 Mobile 硬门槛。Mobile SecureStore 的 persist/restore/clear、
过期与损坏 fail-closed 由另一单写者
在 `apps/mobile/tests/auth/secure-session-spike.spec.ts` 提供；Root gate 只接受该
固定路径的实际 Vitest 结果，不接受 JSON 自报或可变命令。Root 五条实际能力与
Mobile SecureStore 合计构成六项跨端硬性能力。

### 许可证与供应链

候选包安装后元数据：

```text
better-auth@1.6.26                         MIT
@thallesp/nestjs-better-auth@2.7.0       MIT
```

首次 audit 发现 `@nestjs/platform-fastify@11.1.28` 精确依赖
`find-my-way@9.6.0`，命中 High `GHSA-c96f-x56v-gq3h`。不能以 HTTP/2 未启用或
“只是 transitive”作为豁免。pnpm 11 已不读取根 `package.json` 的
`pnpm.overrides`，因此修复配置放在唯一有效位置 `pnpm-workspace.yaml`：

```yaml
overrides:
  "@nestjs/platform-fastify>find-my-way": 9.7.0
```

`9.7.0` 是同一 major 的已修复版本。修复后：

```text
$ pnpm why find-my-way
find-my-way@9.7.0
... @nestjs/platform-fastify@11.1.28
Found 1 version of find-my-way

$ pnpm audit --dev --registry=https://registry.npmjs.org \
    --audit-level high --json
advisories: {}
high: 0
critical: 0
```

Gate 固定使用 npm 官方 audit endpoint；镜像源没有 audit endpoint 时不得忽略
错误或伪造通过。

## Provider 私有边界

以下内容只允许存在于 API 的 provider adapter/private 配置，不得进入公共
contract、OpenAPI 或 SDK：

- Better Auth 私有表：`user`、`session`、`account`、`verification`；
- session token、password hash、provider/account linkage、verification token；
- `BETTER_AUTH_SECRET`、base URL、trusted origins、cookie prefix、邮件凭据；
- Better Auth hook、adapter option、内部 session/user/account 字段；
- 任意 Keycloak realm、client、issuer、JWKS、client secret 或 token claim。

公共身份 port 只表达 `userId`、业务角色、session 是否有效、创建/过期时间与
provider-neutral register/login/session/logout 结果。不得出现
`better-auth.session_token`、数据库表名、Keycloak realm/client 字段、access/
refresh token payload 或 provider 错误对象。

## 被拒方案

Keycloak OIDC Authorization Code + PKCE 未启用。Better Auth 在真实 Root
兼容测试、MIT 许可证和修复后的候选依赖审计中通过，因此没有触发 fallback。
保留两个 provider 的运行 route 会造成撤销、Cookie/Bearer 和账户链接语义分叉，
明确禁止。

若后续固定 Mobile 测试失败、审计重新出现 High/Critical、Nest Fastify 生命周期
回归，或 provider 私有字段泄漏到公共 contract，则本 ADR 的实现状态立即视为
NOT_VERIFIED；不得静默启用 Keycloak，必须重新执行 fallback spike 并提交新 ADR。
