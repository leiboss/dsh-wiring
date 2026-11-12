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

## 方式 A（推荐）：tarball

```powershell
pnpm pack                       # 生成 local-dsh-wiring-<version>.tgz
plugin_manager  action: install_bundle  target: "<绝对路径>/local-dsh-wiring-<version>.tgz"
```

tarball 走正常的依赖解析，7 个官方包会一并落进 profile 的 `node_modules`；宿主 peer（`cordis`、`dsh-llm`、`dsh-fs`…）仍由 DSH 加载器从安装目录解析。

## 方式 B：先显式安装依赖，再装目录

```powershell
dsh plugin --profile web add `
  @deepseek-ai/dsh-lsp@0.2.2-rc.1 `
  @deepseek-ai/dsh-lsp-stdio@0.2.2-rc.1 `
  @deepseek-ai/dsh-tool-lsp@0.2.2-rc.1 `
  @deepseek-ai/dsh-browser-use@0.2.2-rc.1 `
  @deepseek-ai/dsh-experimental-browser-use-playwright-mcp@0.2.2-rc.1 `
  @deepseek-ai/dsh-webhook@0.2.2-rc.1 `
  @deepseek-ai/dsh-webhook-github@0.2.2-rc.1
plugin_manager  action: install_bundle  target: "<仓库绝对路径>"
```

依赖已经落在 profile 根后，`link:` 的目录也能解析到它们。适合在仓库里持续改代码的场景。

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
| `lsp_status` 说 ready 但 `lsp` 仍失败 | 已知局限：doctor 只查二进制，不查工作区 typescript | 按上一行处理 |
| `browser-playwright` disabled | 启动失败会拒绝建会话 | 先跑 `browser_status`，再按提示启用 |
