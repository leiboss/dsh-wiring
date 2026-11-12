# dsh-wiring

[![CI](https://github.com/leiboss/dsh-wiring/actions/workflows/ci.yml/badge.svg)](https://github.com/leiboss/dsh-wiring/actions/workflows/ci.yml)

**Wire what ships. Diagnose what doesn't.**

DeepSeek Harness 0.2.2-rc.1 随 npm 发布了 `@deepseek-ai/dsh-lsp`、`@deepseek-ai/dsh-lsp-stdio`、`@deepseek-ai/dsh-tool-lsp`，但 `dsh-base` 与 `dsh-web-app` 的 patch 里没有任何 lsp 行：默认安装既没有 `lsp` 工具，也没有任何东西告诉你它为什么不在。本包把这三行接上，并提供一个只读的 `lsp_status` 诊断。

| 能力 | 状态 | 模型工具 | 诊断工具 |
|---|---|---|---|
| LSP（TypeScript 一个语言服务器） | 已接线 | `lsp` | `lsp_status` |
| Browser（Playwright，provider 默认关闭） | 已接线 | `mcp__playwright-mcp__*` | `browser_status` |
| GitHub Webhook（签名入口默认关闭） | 已接线 | 新会话（`pull_request` 触发） | `webhook_status` |

安装（在 DSH 会话内执行，路径必须是绝对路径）：

```text
pnpm pack                       # 生成 local-dsh-wiring-<version>.tgz
plugin_manager  action: install_bundle  target: "<绝对路径>/local-dsh-wiring-<version>.tgz"
# 重启该 profile；bundle patch 在下次启动时生效
```

**前置：TypeScript（仅 LSP 需要）**——`dsh-lsp-stdio` 通过 tsserver 工作，tsserver 只从工作区解析。请在会话工作区内执行 `npm install --save-dev typescript@5`，并全局安装 `typescript-language-server`。只装全局 typescript 不够（`Could not find a valid TypeScript installation`）；TypeScript 7 不含 `lib/tsserver.js`，不支持。

**两种受支持方式**见 [docs/INSTALL.md](docs/INSTALL.md)：方式 A 是 tarball（推荐，已验证），也可以从 GitHub 安装（`git+https`，未验证）。发版说明见 [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md)（v0.3.2）。

**目录安装不被直接支持**：`install_bundle` 对目录注册的是 pnpm `link:`，被链接的包不会安装自己的 dependencies，7 个官方依赖不会进 profile，相关行会以 `ERR_MODULE_NOT_FOUND` 失败。请用 tarball。

当前包名是 `@local/dsh-wiring`（`private: true`，仅 GitHub 分发）；改到真实 npm 作用域的步骤见 [docs/RELEASE.md](docs/RELEASE.md)。

> **安装时的 peer 警告是预期行为。** pnpm 会报 `missing peer @deepseek-ai/dsh-llm@0.2.2-rc.1` 一类警告：宿主包由 DSH 加载器从安装目录解析，profile 不安装它们（`autoInstallPeers=false`）。判定安装成功不看警告，只看 `cordis_inspect_query(Config)` 能否查到 `@deepseek-ai/dsh-lsp-stdio`。不要为此在仓库里执行 `npm install`——本包没有开发依赖，也不需要本地安装。

验收：按 [docs/VERIFY.md](docs/VERIFY.md) 执行（LSP / Browser / Webhook 三节），其中包含「语言服务器缺失时会话仍可创建」这一失败场景。

> 本包不重造工具面，只挂载官方包；差异点是失败可解释与默认值。

## 它做什么

- 在 profile 里插入九行：LSP seam / TypeScript provider / 官方 `lsp` 工具 / 本包 doctor / browser seam 与 Playwright provider / webhook 运行时、`pull_request` 规则、签名入口。
- `lsp_status` 只读探测：`ctx.get('lsp')` 是否挂载、`typescript-language-server` 是否在 PATH 上。
- 失败时给出可以直接复制的安装命令；成功时报告解析到的绝对路径。
- 不写配置、不联网、不安装任何二进制、不在 `apply()` 期间做 IO。

## 它不做什么

- 不做 UI、不做配置页、不自动安装语言服务器。
- 不覆盖用户自己的 patch 行；所有行 id 都以 `wiring-` 开头。
- 不内置浏览器、webhook、TTS（见 DESIGN.md 的 Step 2/3/4）。

## 为什么 browser 默认关闭

`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp` 在会话创建之前初始化，启动失败会直接拒绝创建或恢复会话。所以 `wiring-browser-playwright` 行带 `disabled: true`：默认安装不影响任何现有工作流。启用它是一次显式选择；启用后必须新开会话，已加载的 provider 不会接管已存在的会话。`browser_status` 会报告 seam 与 Chromium 候选，失败时给出 `npx playwright install chromium`。

## 为什么 webhook 入口默认关闭

签名入口需要两样默认不存在的东西：一个 webhook secret，以及一层 TLS 反向代理。所以 `wiring-webhook-github` 行带 `disabled: true`，而运行时与 `pull_request` 规则照常挂载（它们不监听端口）。启用入口前请把 secret 存成凭据记录（键名与 `secretEnv` 一致），并确保 `/webhook/github` 不经代理不可从公网到达。另外，适配器返回 **202 只代表「已验签并派发」**，不代表已经创建了会话——会话是否出现要看新会话列表。

## 结构

```
src/index.js                引擎：runChecks / defineStatusTool / formatReport / apply
src/rule.js                 pull_request 规则（@local/dsh-wiring/rule 子路径行）
src/capabilities/           LSP / browser / webhook 描述符
cordis.patch.yml            九行挂载 + Python/Go/Rust 可复制注释块
scripts/check.mjs           静态验收（R5/R6/R8 + 包契约）
scripts/sign.mjs            本地构造 GitHub 签名请求
test/                       引擎与各能力单测（node:test）
docs/VERIFY.md              安装后人工验收
```

## 开发

```sh
node scripts/check.mjs
node test/engine.test.mjs
node test/lsp.test.mjs
node test/browser.test.mjs
node test/webhook.test.mjs
```

零依赖、零构建：不需要 `npm install`。

## License

MIT
