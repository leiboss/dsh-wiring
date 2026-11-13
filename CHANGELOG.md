# Changelog

## 0.4.0

- `lsp_status` now probes the workspace TypeScript install (`typescript-lib`, resolved against the session working directory), removing the "ready but `lsp` fails to initialize" false positive.
- The webhook rule drops repeated deliveries by `deliveryId` (10-minute window), so a GitHub replay creates one Session.
- README gains a "fits / does not fit" section.

## 0.3.3

- Publish-ready manifest: license, repository, homepage, bugs, keywords, `publishConfig.access`, and a `prepack` check.
- Rename the package scope from `@local` to `@leiboss` and unpublish the `private` flag.
- Document the one-line install (`install_bundle target="@leiboss/dsh-wiring@<version>"`) as the supported path.

## 0.3.2

- 修复 `rename-scope` 在 Windows 上未排除归档记录：排除集合按文件名比较，不再拼路径（`join` 在 Windows 产出 `\`）。
- 抽出纯函数 `planRename(root, scope)`，输出统一为相对 POSIX 路径；脚本被 `import` 时不执行副作用。
- 新增 `test/rename-scope.test.mjs`（归档排除、幂等、覆盖范围、路径形态），CI 覆盖该脚本。

## 0.3.1

- 新增 [docs/INSTALL.md](docs/INSTALL.md)：tarball 安装（推荐）与「先装 7 个官方依赖再装目录」两种受支持方式，附排查表。
- 记录目录安装的 `link:` 语义：被链接的包不会安装自己的 dependencies，相关行会 `ERR_MODULE_NOT_FOUND`。
- 记录 TypeScript 前置：tsserver 只从工作区解析，需 `typescript@5`；TypeScript 7 不含 `lib/tsserver.js`，不兼容。
- 记录本地 profile 的实测结果：安装（tarball）通过，LSP 三种操作已验证。
- `scripts/rename-scope.mjs` 排除 `docs/VERIFICATION.md`：归档记录不随作用域改名。

## 0.3.0

- 新增 webhook 能力：挂载 `@deepseek-ai/dsh-webhook` 运行时、一个 `pull_request` 规则子路径行，以及默认禁用的签名 GitHub 入口。
- 规则把 PR 元数据作为不可信数据处理，并固定 `agentPreset` / `permissionPreset` 默认值。
- 入口行默认 `disabled: true`（需要 secret 与 TLS 反代），并新增会话/入口安全断言。

## 0.2.0

- 新增 browser 能力：挂载 `@deepseek-ai/dsh-browser-use` 与 Playwright MCP provider，并提供只读的 `browser_status`。
- 引擎新增 `paths` 检查（任一候选存在即通过）与报告 `hint` 字段；LSP 输出保持不变。
- provider 行默认 `disabled: true`，并新增会话安全断言，保证危险能力必须显式开启。

## 0.1.1

- Pin the three official LSP packages to the host version line (`0.2.2-rc.1`); the `latest` dist-tag is stale and its peers cannot resolve on a 0.2.2 host.
- Normalize newlines before parsing `cordis.patch.yml`, and force LF with `.gitattributes` so a Windows checkout cannot fail the patch-header check.
- Correct the README install command (`action` + `target`) and document that missing-peer warnings are expected.

## 0.1.0

- 首次发布：把官方 `@deepseek-ai/dsh-lsp`、`dsh-lsp-stdio`（仅 TypeScript）、`dsh-tool-lsp` 挂进 profile。
- 新增只读诊断工具 `lsp_status`：报告 seam 与 `typescript-language-server` 的可用性，失败时给出安装命令。
- 零运行时依赖、零构建；静态检查与两组单测全部命令化。
