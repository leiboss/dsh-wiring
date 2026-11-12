# 安装与验收记录

- **日期**：2026-11-12
- **仓库**：`dsh-wiring`，基线 commit `1482aea`（本文件所在提交为其后继）
- **宿主版本**：`package.json` 的 `engines.dsh` = `>=0.2.2-rc.1 <0.3.0-0`；当前环境无 `dsh` CLI（`dsh --version` → command not found），因此**安装与 profile 验收未在本环境执行**
- **包**：`@local/dsh-wiring@0.2.0`

## 1. 检查项

| 检查项 | 期望 | 实际 | 结论 |
|---|---|---|---|
| `node scripts/check.mjs` | PASS，locale / R6 / R8 全 ok | 7 项全 ok，`PASS` | 通过 |
| `node test/engine.test.mjs` | fail 0 | tests 11 / pass 11 / fail 0 | 通过 |
| `node test/lsp.test.mjs` | fail 0 | tests 6 / pass 6 / fail 0 | 通过 |
| `node test/browser.test.mjs` | fail 0 | tests 5 / pass 5 / fail 0 | 通过 |
| `npm pack --dry-run`（修复前） | patch、src、locale、icon、README、LICENSE 在包内 | 10 个文件；`docs/` 与 `CHANGELOG.md` 缺失 | 已修 |
| `npm pack --dry-run`（修复后） | 同上 + `docs/VERIFY.md`、`CHANGELOG.md` | 12 个文件，两者已包含 | 通过 |
| `listConfigs @deepseek-ai/dsh-lsp-stdio` | 返回条目 + `packageDir` | 未执行（不在 DSH 会话内） | 待人工 |
| `listConfigs @deepseek-ai/dsh-browser-use` | 返回条目 + `packageDir` | 未执行 | 待人工 |
| `listTools` | 含 `lsp` / `lsp_status` / `browser_status`，无 `mcp__playwright-mcp__*` | 未执行 | 待人工 |
| `list_plugins` 行状态 | lsp/doctor/browser-use active，playwright disabled | 未执行 | 待人工 |

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

## 2. 安装卡（B2：当前不在 DSH 会话内）

```text
安装（在 DSH 会话内）：
1) plugin_manager  action: install_bundle  target: "/absolute/path/to/dsh-wiring"
2) cordis_inspect_query(host, Config, listConfigs, { "name": "@deepseek-ai/dsh-lsp-stdio" })
   → 期望：返回条目 + packageDir
3) cordis_inspect_query(host, Tool, listTools)
   → 期望：lsp / lsp_status / browser_status；无 mcp__playwright-mcp__*
4) plugin_manager  action: list_plugins  limit: 100
   → 期望：wiring-* active；wiring-browser-playwright disabled
若 2) 为空：
   dsh plugin --profile web add @deepseek-ai/dsh-lsp @deepseek-ai/dsh-lsp-stdio @deepseek-ai/dsh-tool-lsp @deepseek-ai/dsh-browser-use @deepseek-ai/dsh-experimental-browser-use-playwright-mcp
   然后重装 bundle 并重跑 2)
```

安装时 pnpm 报 `missing peer @deepseek-ai/dsh-llm@0.2.2-rc.1` 一类警告是**预期行为**（宿主包由加载器提供，`autoInstallPeers=false`）；判定成功只看 `listConfigs` 能否查到条目。

## 3. 行状态预期

| 行 ID | 期望 enabled | 期望 fiberPhase |
|---|---|---|
| `wiring-lsp` | true | active |
| `wiring-lsp-typescript` | true | active |
| `wiring-lsp-tool` | true | active |
| `wiring-doctor` | true | active |
| `wiring-browser-use` | true | active |
| `wiring-browser-playwright` | **false** | —（disabled） |

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

- 真实 `lsp` 工具的 `goToDefinition` 调用（需要一个带符号的真实项目与新会话）。
- 启用 `wiring-browser-playwright` 后 `mcp__playwright-mcp__*` 的真实浏览器调用（打开页面、截图）。
- 卸载洁净度：卸载 bundle / 移除行后工具消失、profile 的 patch 未被本包改写。
- 可选演练（E 节）未执行：本环境无 `dsh` CLI，且属共享环境，不做二进制改名演练。

Step 3 落地，安装验收仍未执行。
