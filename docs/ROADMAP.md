# Roadmap

发布后的三项，按优先级。每项都应先更新文档，再动代码。

## 已完成

- ~~`lsp_status` 增加工作区 TypeScript（tsserver）检查~~ —— 0.4.0 已加 `typescript-lib`（`workspacePath`，从 `exec.agent.session.header.cwd` 解析），消除「报 ready 但 lsp 初始化失败」的假阳性；注意多工作区场景需会话目录而非 `process.cwd()`。
- ~~webhook 入口的真实验收~~ —— 规则已按 `deliveryId` 去重（10 分钟窗口）；401/202 与建会话的真机验收仍需 secret 与反代后人工执行。

## 1. npm 发布（若决定）

`node scripts/rename-scope.mjs --apply` → `private: false` → `npm publish --access public`，
并用 `npm view <pkg> dist.tarball` 校验产物可下载；否则继续 GitHub-only 分发。
发布前按 [RELEASE.md](RELEASE.md) 的检查单逐项确认。
