## dsh-wiring v0.4.1

把 DeepSeek Harness 已发布、但没有被任何 profile 挂载的能力接上线：LSP、浏览器、GitHub webhook。

### 能力

- **LSP**：`lsp` 工具 + `lsp_status`（默认启用；需工作区 `typescript@5` + 全局 `typescript-language-server`）
- **Browser**：`browser-use` seam + Playwright provider（provider 默认关闭）+ `browser_status`
- **Webhook**：运行时 + pull_request 规则 + 签名入口（入口默认关闭）+ `webhook_status`

### 已验证

- npm 发布：`@leiboss/dsh-wiring@0.4.1`（`latest`），tarball 与仓库 HEAD 逐文件一致
- tarball 安装：9 个 Loader 行，7 active / 2 disabled；工具表出现 `lsp`、`lsp_status`、`browser_status`、`webhook_status`
- LSP：`goToDefinition`、`findReferences`、`hover` 三种操作在真实 TypeScript 文件上通过

### 0.4.x 变更

- `lsp_status` 新增 `workspace typescript (tsserver)` 检查，按会话工作区解析 `node_modules/typescript/lib/tsserver.js`，修掉「报 ready 但 `lsp` 初始化失败」的假阳性
- webhook 规则按 `deliveryId` 去重（10 分钟窗口），GitHub 重投不再重复建会话
- `check.hint` 仅在该检查失败时渲染；TypeScript 7 的说明从能力级 hint 移到 `typescript-lib`，正常时不再打印

### 未验证（默认关闭，故不影响使用）

- webhook 的 401/202 与建会话（需要 secret 与 TLS 反代）
- 浏览器工具调用（provider 需显式启用）
- 卸载洁净度

### 安装

见 [INSTALL.md](INSTALL.md)：**目录安装不受支持**（pnpm `link:` 不装依赖）；推荐 `plugin_manager action: install_bundle target: "@leiboss/dsh-wiring@0.4.1"`。

### 已知限制

- `typescript-lib` 按会话工作目录解析；多工作区下若会话不在项目根，可能误报 `not found`。
- TypeScript 7 不含 `lib/tsserver.js`，必须用 `typescript@5`。
