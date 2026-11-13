# 安装

`install_bundle` 对**目录**注册的是 pnpm `link:`：被链接的包不会安装自己的
dependencies，本包的 7 个官方依赖不会被装进 profile，相关行会以
`ERR_MODULE_NOT_FOUND` 失败。因此目录安装**不是**受支持方式。

## 前置：TypeScript（LSP 需要）

`dsh-lsp-stdio` 通过 tsserver 工作，而 tsserver 只从**工作区**解析：

```powershell
npm install --save-dev typescript@5     # 必须在会话工作区内执行
npm install -g typescript-language-server
```

只装全局 typescript 不够：`lsp` 会报 `Could not find a valid TypeScript installation`。
不要用 TypeScript 7：`typescript@7` 已不包含 `lib/tsserver.js`，同样会失败。
若必须使用其他 TypeScript 位置，可在 `wiring-lsp-typescript` 行的 `config.servers.typescript.initializationOptions` 里设置 `tsserver.path`。

## 方式 A（推荐）：按包名安装

```text
plugin_manager  action: install_bundle  target: "@leiboss/dsh-wiring@0.3.3"
```

`install_bundle` 会经由包管理器解析依赖，本包的 7 个官方依赖一并落入 profile；宿主 peer（`cordis`、`dsh-llm`、`dsh-fs`…）仍由 DSH 加载器从安装目录解析。

该包已具备发布元数据（`publishConfig.access: public`）；**首次 `npm publish` 完成前，注册表上还没有这个包**，请先用方式 B。

## 方式 B（从源码）：tarball

```powershell
pnpm pack                       # 生成 leiboss-dsh-wiring-<version>.tgz
plugin_manager  action: install_bundle  target: "<绝对路径>/leiboss-dsh-wiring-<version>.tgz"
```

tarball 走正常的依赖解析，效果与方式 A 相同，适合本地验证或未发布时使用。

## 不受支持：目录安装

```powershell
plugin_manager  action: install_bundle  target: "<仓库绝对路径>"
```

`install_bundle` 对目录注册的是 pnpm `link:`，被链接的包不会安装自己的 dependencies，7 个官方依赖不会进 profile，相关行会 `ERR_MODULE_NOT_FOUND`。即使手工预装这 7 个包能让 `link:` 解析到它们，也只是绕行：依赖需要人工维护，且容易与宿主版本线漂移。

## 未验证：从 GitHub 直装

```sh
dsh plugin add git+https://github.com/leiboss/dsh-wiring.git
```

需 git 与网络；`github:` 简写会被 pnpm 解析成 `git+ssh://git@github.com/...`，没有 SSH key 会失败，因此必须显式用 `git+https`。该路径**未在本仓库验证**。

## 安装后的期望

- `list_plugins` 出现 9 个 `wiring-*` 行；其中 `wiring-browser-playwright` 与 `wiring-webhook-github` 为 `disabled`（设计如此）。
- 工具表出现 `lsp`、`lsp_status`、`browser_status`、`webhook_status`；不出现 `mcp__playwright-mcp__*`。
- `wiring-lsp-typescript` 只有在「二进制 + 工作区 `typescript@5`」都就绪时才 `active`。

## 排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 多个行 `ERR_MODULE_NOT_FOUND` | 用了目录安装（link） | 改用方式 A 或 B |
| `missing peer …` 警告 | 宿主 peer 不装进 profile，由加载器提供 | 预期行为，不算失败 |
| `wiring-lsp-typescript` failed | 缺 `typescript-language-server` | `npm install -g typescript-language-server` |
| `lsp` 报 `Could not find a valid TypeScript installation` | 工作区缺 typescript，或用了 TS 7 | `npm install --save-dev typescript@5` |
| `lsp` 报 `no LSP provider handles` | 该扩展名没有可用 provider | 先跑 `lsp_status` |
| `lsp_status` 说 ready 但 `lsp` 仍失败 | 0.4.0 起 `lsp_status` 会直接报 `workspace typescript (tsserver)` 缺失（`typescript-lib` 项），不再有这类假阳性 | 按上一行处理 |
| `browser-playwright` disabled | 启动失败会拒绝建会话 | 先跑 `browser_status`，再按提示启用 |
