## dsh-wiring v0.3.2

把 DeepSeek Harness 已发布、但没有被任何 profile 挂载的能力接上线：LSP、浏览器、GitHub webhook。

### 能力

- **LSP**：`lsp` 工具 + `lsp_status`（默认启用；需工作区 `typescript@5` + 全局 `typescript-language-server`）
- **Browser**：`browser-use` seam + Playwright provider（provider 默认关闭）+ `browser_status`
- **Webhook**：运行时 + pull_request 规则 + 签名入口（入口默认关闭）+ `webhook_status`

### 已验证

- tarball 安装：9 个 Loader 行，7 active / 2 disabled；工具表出现 `lsp`、`lsp_status`、`browser_status`、`webhook_status`
- LSP：`goToDefinition`、`findReferences`、`hover` 三种操作在真实 TypeScript 文件上通过

### 未验证（默认关闭，故不影响使用）

- webhook 的 401/202 与建会话（需要 secret 与 TLS 反代）
- 浏览器工具调用（provider 需显式启用）
- 卸载洁净度

### 安装

见 [INSTALL.md](INSTALL.md)：**目录安装不受支持**（pnpm `link:` 不装依赖）；推荐 `plugin_manager action: install_bundle target: "@leiboss/dsh-wiring@0.3.3"`。

### 已知限制

- `lsp_status` 只检查二进制是否在 PATH，不检查工作区 `typescript`；因此可能出现「`lsp_status` 说 ready、`lsp` 初始化失败」。
- TypeScript 7 不含 `lib/tsserver.js`，必须用 `typescript@5`。
