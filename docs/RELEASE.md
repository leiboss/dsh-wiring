# 发布

人工检查单，不是 CI 任务。**不要自动化 tag 或 publish。**

## 版本策略

- 当前处于 `0.x`：次版本（`0.2.0` → `0.3.0`）承载新能力与破坏性变更；补丁版本只修 bug 与文档。
- 三个官方依赖（LSP、browser、webhook）必须与 `engines.dsh` **同一条版本线**（当前 `0.2.2-rc.1`）。宿主升级时同步升级这五个 `@deepseek-ai/dsh-*` 依赖，并重跑全部测试；不要按 `latest` dist-tag 取版本。

## 发布前检查单

1. 五组测试全绿：

   ```sh
   node test/engine.test.mjs
   node test/lsp.test.mjs
   node test/browser.test.mjs
   node test/webhook.test.mjs
   node scripts/check.mjs
   ```

2. `npm pack --dry-run --json`：确认 `cordis.patch.yml`、`src/**`、`locale/**`、`docs/VERIFY.md`、`docs/VERIFICATION.md`、`README.md`、`LICENSE` 在清单里，且不含 `test/`、`scripts/`。
3. 安装验收：按 [VERIFY.md](VERIFY.md) 执行，并在 [VERIFICATION.md](VERIFICATION.md) 记录结果。
   **当前状态：安装验收未执行**（无 DSH 会话/CLI），因此本仓库尚不具备打 tag 的条件。
4. 只有前三项都完成后才允许 `git tag`。tag 与 npm 发布由人工执行。

## 两种发布形态

### A. GitHub-only（当前状态）

`package.json` 仍是 `"private": true` 与 `@local/dsh-wiring` 作用域。适用方式：

```text
plugin_manager  action: install_bundle  target: "/absolute/path/to/dsh-wiring"
```

或直接从 GitHub 安装：

```sh
dsh plugin add github:leiboss/dsh-wiring
```

### B. npm

1. 改名到真实作用域（先 dry-run 看差异）：

   ```sh
   node scripts/rename-scope.mjs --scope <your-scope>
   node scripts/rename-scope.mjs --scope <your-scope> --apply
   ```

2. 把 `package.json` 的 `"private": true` 改为 `false`。
3. `npm publish --access public`。
4. 校验产物可下载：

   ```sh
   npm view <scope>/dsh-wiring dist.tarball
   curl -I "$(npm view <scope>/dsh-wiring dist.tarball)"
   ```

## 回退

- DSH 侧：`plugin_manager  action: remove_bundle  target: "<bundle-id>"`，然后重启 profile。
- npm 侧：用 `npm deprecate <pkg>@"<range>" "reason"` 标注问题版本。**不要 `npm unpublish`**：下载与缓存不可撤销，且会破坏已固定版本的 profile。
