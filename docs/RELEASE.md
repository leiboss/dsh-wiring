# 发布

人工检查单，不是 CI 任务。**不要自动化 tag 或 publish。**

## 版本策略

- 当前处于 `0.x`：次版本（`0.2.0` → `0.3.0`）承载新能力与破坏性变更；补丁版本只修 bug 与文档。
- 三个官方依赖（LSP、browser、webhook）必须与 `engines.dsh` **同一条版本线**（当前 `0.2.2-rc.1`）。宿主升级时同步升级这五个 `@deepseek-ai/dsh-*` 依赖，并重跑全部测试；不要按 `latest` dist-tag 取版本。

## 发布前检查单

1. 六组测试全绿（**在 Windows 与 Linux 都要跑**，CI 矩阵已覆盖两个平台）：

   ```sh
   node test/engine.test.mjs
   node test/lsp.test.mjs
   node test/browser.test.mjs
   node test/webhook.test.mjs
   node test/rename-scope.test.mjs
   node scripts/check.mjs
   ```

2. `npm pack --dry-run --json`：确认 `cordis.patch.yml`、`src/**`、`locale/**`、`docs/VERIFY.md`、`docs/VERIFICATION.md`、`README.md`、`LICENSE` 在清单里，且不含 `test/`、`scripts/`。
3. 安装验收：按 [VERIFY.md](VERIFY.md) 执行，并在 [VERIFICATION.md](VERIFICATION.md) 记录结果。
   **当前状态：安装（tarball）与 LSP 三种操作已验证，见 [VERIFICATION.md](VERIFICATION.md)；webhook 入口与浏览器工具仍未验证（两者默认关闭）。**
4. `node scripts/rename-scope.mjs --scope <真实作用域>` 的 dry-run 不得包含 `docs/VERIFICATION.md`（归档不改名）。
5. 只有前四项都完成后才允许 `git tag`。tag 与 npm 发布由人工执行。

## 两种发布形态

### A. GitHub-only（当前状态）

`package.json` 仍是 `"private": true` 与 `@local/dsh-wiring` 作用域。受支持的方式：

```sh
# 推荐：tarball（已验证）
pnpm pack
plugin_manager  action: install_bundle  target: "<绝对路径>/local-dsh-wiring-<version>.tgz"
```

```sh
# 备选：从 GitHub 安装（需 git 与网络；未验证）
dsh plugin add git+https://github.com/leiboss/dsh-wiring.git
```

> 目录安装不受支持（`link:` 不装依赖）。见 [INSTALL.md](INSTALL.md)。

### B. npm

1. 改名到真实作用域（先 dry-run 看差异）：

   ```sh
   node scripts/rename-scope.mjs --scope <your-scope>
   node scripts/rename-scope.mjs --scope <your-scope> --apply
   ```

   `docs/VERIFICATION.md` 是归档记录，不参与改名（脚本已排除），以免篡改历史。

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
