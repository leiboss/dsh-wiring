# 安装与验收记录

## 当前状态

- 三个能力已接线：LSP、Browser、GitHub Webhook。
- 安装**已在本地 profile 中实测通过**：`list_plugins` 出现 9 个 `wiring-*` 行，`wiring-browser-playwright` 与 `wiring-webhook-github` 为 `disabled`；工具表出现 `lsp`、`lsp_status`、`browser_status`、`webhook_status`，未出现 `mcp__playwright-mcp__*`。
- LSP 正向路径**未验证**：`wiring-lsp-typescript` 需要 `typescript-language-server`，本机未安装。

- **日期**：2026-11-12
- **仓库**：`dsh-wiring`，基线 commit `1482aea`（本文件所在提交为其后继）
- **宿主版本**：`package.json` 的 `engines.dsh` = `>=0.2.2-rc.1 <0.3.0-0`
- **包**：`@local/dsh-wiring@0.3.1`
- **安装方式**：方式 A（tarball）；目录安装是 `link:`，不会安装本包依赖，见 [INSTALL.md](INSTALL.md)

## 1. 检查项

| 检查项 | 期望 | 实际 | 结论 |
|---|---|---|---|
| `node scripts/check.mjs` | PASS，locale / R6 / R8 全 ok | 7 项全 ok，`PASS` | 通过 |
| `node test/engine.test.mjs` | fail 0 | tests 11 / pass 11 / fail 0 | 通过 |
| `node test/lsp.test.mjs` | fail 0 | tests 6 / pass 6 / fail 0 | 通过 |
| `node test/browser.test.mjs` | fail 0 | tests 5 / pass 5 / fail 0 | 通过 |
| `npm pack --dry-run`（修复前） | patch、src、locale、icon、README、LICENSE 在包内 | 10 个文件；`docs/` 与 `CHANGELOG.md` 缺失 | 已修 |
| `npm pack --dry-run`（修复后） | 同上 + `docs/VERIFY.md`、`CHANGELOG.md` | 19 个文件，两者已包含 | 通过 |
| `listConfigs @deepseek-ai/dsh-lsp-stdio` | 返回条目 + `packageDir` | 返回条目，`packageDir` 指向 profile 根 `node_modules` | 通过 |
| `listConfigs @deepseek-ai/dsh-browser-use` | 返回条目 + `packageDir` | 返回条目 | 通过 |
| `listTools` | 含 `lsp` / `lsp_status` / `browser_status` / `webhook_status`，无 `mcp__playwright-mcp__*` | 四项均在；无 `mcp__playwright-mcp__*` | 通过 |
| `list_plugins` 行状态 | 9 个 `wiring-*` 行；playwright 与 webhook-github disabled | 9 行齐全；两行为 `disabled`；`wiring-lsp-typescript` 未 active（缺语言服务器） | 通过（LSP provider 待装语言服务器） |

打包清单（修复后）：

```text
CHANGELOG.md
LICENSE
README.md
cordis.patch.yml
docs/VERIFY.md
icon.svg
locale/en.json
locale/zh.json
package.json
src/capabilities/browser.js
src/capabilities/lsp.js
src/index.js
```

依赖快照：

```text
@local/dsh-wiring 0.2.0 {
  "@deepseek-ai/dsh-browser-use": "0.2.2-rc.1",
  "@deepseek-ai/dsh-experimental-browser-use-playwright-mcp": "0.2.2-rc.1",
  "@deepseek-ai/dsh-lsp": "0.2.2-rc.1",
  "@deepseek-ai/dsh-lsp-stdio": "0.2.2-rc.1",
  "@deepseek-ai/dsh-tool-lsp": "0.2.2-rc.1"
}
```

## 2. 安装路径（已执行，方式 A）

```text
pnpm pack
plugin_manager  action: install_bundle  target: "<绝对路径>/local-dsh-wiring-0.3.1.tgz"
```

目录安装（`install_bundle` 对目录注册 `link:`）不会安装本包 dependencies，7 个官方包不会进入 profile，相关行会 `ERR_MODULE_NOT_FOUND`；需要用 tarball，或先按 [INSTALL.md](INSTALL.md) 的方式 B 显式安装 7 个依赖再装目录。

安装时 pnpm 报 `missing peer @deepseek-ai/dsh-llm@0.2.2-rc.1` 一类警告是**预期行为**（宿主包由加载器提供，`autoInstallPeers=false`）；判定成功只看 `listConfigs` 能否查到条目。

## 3. 行状态（实测）

| 行 ID | enabled | fiberPhase |
|---|---|---|
| `wiring-lsp` | true | active |
| `wiring-lsp-typescript` | true | 非 active（缺 `typescript-language-server`） |
| `wiring-lsp-tool` | true | active |
| `wiring-doctor` | true | active |
| `wiring-browser-use` | true | active |
| `wiring-browser-playwright` | **false** | —（disabled） |
| `wiring-webhook-runtime` | true | active |
| `wiring-webhook-rule` | true | active |
| `wiring-webhook-github` | **false** | —（disabled） |

## 4. 本轮代码改动

1. `package.json` 的 `files` 追加 `"docs"` 与 `"CHANGELOG.md"`，使 README 中的 `docs/VERIFY.md` 链接在打包后仍有效。
2. `src/index.js` 的 `Check` JSDoc 删除 `@property {string} [hint]`。该字段没有读取方（只有 `capability.hint` 被 `buildReport` / `execute` 兜底 / `formatReport` 使用），留着会误导后续能力作者。

```diff
-  "files": ["src", "cordis.patch.yml", "locale/*.json", "icon.svg", "README.md"],
+  "files": ["src", "cordis.patch.yml", "locale/*.json", "icon.svg", "README.md", "docs", "CHANGELOG.md"],

  * @property {string} [install] Copy-pasteable install command.
- * @property {string} [hint] Extra non-command guidance.
  */
```

两处改完后 A 的四条命令仍全绿（engine 11/11、lsp 6/6、browser 5/5、check PASS）。

## 5. 未验证（需人工，且需要新会话）

- LSP 正向跳转：`wiring-lsp-typescript` 未 active，**缺 `typescript-language-server`**；`lsp` 的真实 `goToDefinition` 未验证。
- webhook 的 401 / 202 与「202 是否真的建了会话」：入口行默认 disabled，未配置 secret。
- 启用 `wiring-browser-playwright` 后的真实浏览器工具调用（打开页面、截图）。
- 卸载洁净度：卸载 bundle / 移除行后工具消失、profile 的 patch 未被本包改写。

Step 3 落地；Step 4 记录 tarball 安装实测结果。
