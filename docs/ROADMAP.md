# Roadmap

发布后的三项，按优先级。每项都应先更新文档，再动代码。

## 1. `lsp_status` 增加工作区 TypeScript（tsserver）检查

现状只查 `typescript-language-server` 是否在 PATH，工作区缺 `typescript@5` 时仍报 ready，产生假阳性。

- 需要读取会话工作区并解析 `typescript/lib/tsserver.js`；
- 注意多工作区场景下 `process.cwd()` 可能不等于会话工作区，必须显式读取会话目录（或标注该局限）；
- 顺带识别 TypeScript 7（缺 `lib/tsserver.js`）并给出可复制的降级命令。

## 2. webhook 入口的真实验收

启用 `wiring-webhook-github`（需 secret 与 TLS 反代）后验证：

- 错误签名 → 401；
- 正确签名 → 202，且确实出现标题为 `PR #<n>: <title>` 的新会话；
- `action: closed` → 202 但不建会话（规则过滤，而非 202 语义）。

## 3. npm 发布（若决定）

`node scripts/rename-scope.mjs --apply` → `private: false` → `npm publish --access public`，
并用 `npm view <pkg> dist.tarball` 校验产物可下载；否则继续 GitHub-only 分发。
发布前按 [RELEASE.md](RELEASE.md) 的检查单逐项确认。
