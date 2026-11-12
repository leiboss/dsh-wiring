# 安装后验收（8 步）

本文件是**人工验收**清单：单元测试与静态检查不覆盖真实挂载、真实语言服务器与卸载洁净度。
每一步都写清「操作 → 期望 → 证据」。命令与工具调用以绝对路径为准；Windows 与 POSIX 的路径写法可以不同，语义相同。

前置：

- DSH 0.2.2-rc.1，profile 已能正常启动。
- 本仓库根目录就是 bundle（下称 `<bundle>`，例如 `/absolute/path/to/dsh-wiring`）。
- 一个含 `.ts` 文件的真实工作区（下称 `<workspace>`）。

---

## 1. 安装 bundle

**操作**：在 DSH 会话中调用 `plugin_manager` 的 `install_bundle`，参数使用绝对路径：

```json
{ "path": "/absolute/path/to/dsh-wiring" }
```

**期望**：安装成功；`@local/dsh-wiring` 出现在该 profile 的 bundle 列表；未出现 peer 解析错误。

**证据**：`plugin_manager` 返回的安装结果（含包名与版本 0.1.0）；`<profile>/package.json` 的 `dsh.profile.bundles` 出现 `@local/dsh-wiring`。

---

## 2. 确认官方 provider 已挂载

**操作**：

```text
plugin_manager listConfigs
```

或对合成树做一次检查：

```json
{ "id": "wiring-lsp-typescript" }
```

配合 `cordis_inspect_query` 查询该行的 `name` 与 `config`。

**期望**：存在 id 为 `wiring-lsp`、`wiring-lsp-typescript`、`wiring-lsp-tool`、`wiring-doctor` 的四行；`wiring-lsp-typescript` 的 `name` 是 `@deepseek-ai/dsh-lsp-stdio`，`config.servers.typescript.command` 是 `typescript-language-server`。

**证据**：`listConfigs` 输出包含 `@deepseek-ai/dsh-lsp-stdio`；`cordis_inspect_query` 返回的四行快照。

安装日志里出现 missing peer 警告是预期行为（宿主包由加载器提供）；只有 `listConfigs` 查不到条目才算依赖解析失败，此时回退为 `dsh plugin --profile web add @deepseek-ai/dsh-lsp @deepseek-ai/dsh-lsp-stdio @deepseek-ai/dsh-tool-lsp`。

---

## 3. 确认两个工具都出现

**操作**：`Tool.listTools`。

**期望**：同时出现官方模型工具 `lsp` 与本包的 `lsp_status`；`lsp_status` 的描述说明它报告本机是否具备该能力。

**证据**：`Tool.listTools` 输出中两条工具记录（名称 + 描述首句）。

---

## 4. 真实符号跳转

**操作**：新建会话，工作目录设为 `<workspace>`，对真实 TypeScript 源文件调用 `lsp`：

```json
{
  "operation": "goToDefinition",
  "file_path": "/absolute/path/to/workspace/src/example.ts",
  "line": 10,
  "character": 7
}
```

坐标是 **1-based** 的 UTF-16 行列；光标要落在符号上。

**期望**：返回该符号的定义位置（`path:line:character`），而不是 `No results.` 或 `LSP_UNAVAILABLE`。

**证据**：`lsp` 工具结果里包含目标文件与定义行号；同一位置用编辑器跳转可复现。

---

## 5. 遮蔽二进制后的降级

**操作**：

1. 让 `typescript-language-server` 从 PATH 消失（临时改名，或把 PATH 指向一个不含它的目录）。
2. 重启该 profile。
3. 调用 `lsp_status`（`{}` 无参数）。
4. 新建一个会话。

**期望**：

- `lsp_status` 返回 `ok: false`；`typescript` 项 `detail` 为 `not found on PATH`，`next` 为 `npm install -g typescript-language-server typescript`。
- **会话仍可创建**：bundle 的 `apply()` 不探测、不抛错，缺二进制只影响 `lsp` 调用本身。

**证据**：`lsp_status` 的完整文本输出（含 `install:` 行）；新会话创建成功的记录。

---

## 6. 恢复二进制

**操作**：还原第 5 步的改名/PATH 改动，重启 profile，再调用一次 `lsp_status`。

**期望**：`ok: true`；`typescript` 项 `detail` 是解析到的绝对路径。

**证据**：`lsp_status` 输出中的绝对路径与 `command -v typescript-language-server`（Windows：`where typescript-language-server`）一致。

---

## 7. 卸载后工具消失

**操作**：通过 `plugin_manager` 卸载 `@local/dsh-wiring`，重启 profile，再调用 `Tool.listTools`。

**期望**：`lsp` 与 `lsp_status` 都消失（四行 patch 随 bundle 一起移除）；profile 仍能正常启动。

**证据**：卸载结果 + 重启后的 `Tool.listTools` 输出（不再包含这两个名称）。

---

## 8. profile patch 未被改写

**操作**：对比安装前、使用中、卸载后的 `<profile>/cordis.patch.yml` 与 `$DSH_HOME/cordis.patch.yml`。

**期望**：本包从未写入这两个文件；doctor 只读。若安装过程由 `plugin_manager` 追加了 bundle 引用，那属于安装器的正常行为，而不是本包写 profile。

**证据**：三个时间点的文件 diff（除安装器自身的 bundle 列表变更外为空）；`git status`（若 profile 在版本控制下）无意外改动。

---

## 9. Browser：安装后诊断

**操作**：调用 `browser_status`。

**期望**：报告 `browser-use seam` 与 `Chromium-family browser` 两项；缺少浏览器时 `install` 为 `npx playwright install chromium`，并附带「默认关闭、启用后需新开会话」的 hint。

**证据**：`browser_status` 的完整文本输出。

---

## 10. Browser：默认关闭不影响新建会话（最重要）

**操作**：不启用 `wiring-browser-playwright`，直接新建一个会话。

**期望**：会话正常创建，与未安装本包时一致；工具列表中没有 `mcp__playwright-mcp__*`。

**证据**：新建会话成功 + `Tool.listTools` 输出。

---

## 11. Browser：启用后新开会话出现 Playwright 工具

**操作**：`plugin_manager set_plugin` 启用 `include:wiring-browser-playwright`，重启 profile，**新建**会话（已存在的会话不会被接管），再调用 `Tool.listTools`。

**期望**：出现一组 `mcp__playwright-mcp__*` 工具。

**证据**：启用记录、重启日志、新会话的 `Tool.listTools` 输出。

---

## 12. Browser：真实打开页面并截图

**操作**：在新会话中让模型打开 `https://example.com` 并截图。

**期望**：工具返回成功，结果中包含一张图片；页面对应 example.com。

**证据**：工具调用结果与截图。

---

## 13. Browser：失败演练

**操作**：把 `wiring-browser-playwright` 的 `config.executablePath` 指向一个不存在的文件，重启后新建会话。

**期望**：新建会话被拒绝，错误信息指向浏览器/可执行文件，而不是静默降级。随后还原 `executablePath` 并新开会话恢复正常。

**证据**：拒绝创建的报错文本；还原后新建会话成功的记录。

---

## 14. Webhook：安装后诊断

**操作**：调用 `webhook_status`。

**期望**：报告 `webhook runtime` 一项为 mounted（seam `webhookRuntime` 存在）。若未挂载，说明 `wiring-webhook-runtime` 行未激活。

**证据**：`webhook_status` 的完整文本输出。

---

## 15. Webhook：入口默认关闭且不影响 UI

**操作**：不启用 `wiring-webhook-github`，重启 profile，打开 UI 并新建会话。

**期望**：`plugin_manager list_plugins` 中 `wiring-webhook-runtime`、`wiring-webhook-rule` 为 active，`wiring-webhook-github` 为 disabled；UI 正常打开，没有监听端口，也没有 401/503 之类的入口错误。

**证据**：`list_plugins` 中三行的 `enabled` / `fiberPhase`；UI 截图。

---

## 16. Webhook：错误签名返回 401

**操作**：把 secret 存成凭据记录（键 `GITHUB_WEBHOOK_SECRET`），启用 `wiring-webhook-github` 并重启；然后用错误的 secret 构造请求：

```sh
node scripts/sign.mjs docs/examples/pull_request.json wrong-secret
# 取输出的 curl.exe 命令执行（目标 http://127.0.0.1:3080/webhook/github）
```

**期望**：HTTP **401**，不创建会话。可选：缺少凭据记录时应为 **503**，非 JSON body 应为 **415**。

**证据**：HTTP 状态码与会话列表（无新会话）。

---

## 17. Webhook：正确签名 → 202 且出现新会话

**操作**：用真实 secret 重跑：

```sh
node scripts/sign.mjs docs/examples/pull_request.json "$GITHUB_WEBHOOK_SECRET"
```

执行输出的 curl.exe 命令。

**期望**：HTTP **202**（只代表已验签并派发），随后出现一个**新会话**，标题形如 `PR #42: Add the widget`，prompt 内含「untrusted data」提示与 payload 的 JSON 块。

**证据**：202 响应；新会话标题与首条消息。

---

## 18. Webhook：`action: closed` 不建会话

**操作**：复制 `docs/examples/pull_request.json`，把 `action` 改成 `closed`，用正确签名再发一次。

**期望**：HTTP **202**，但**没有**新会话——这验证的是规则过滤，而不是 202 语义。

**证据**：202 响应 + 会话列表无新增。

---

## 失败时的定位顺序

1. 第 2 步没有 `@deepseek-ai/dsh-lsp-stdio` → patch 没被应用，检查 `dsh.bundle.patch` 与 profile 的 bundle 顺序。
2. 第 3 步没有 `lsp_status` → `wiring-doctor` 行未激活，检查 `apply()` 是否抛错与 `inject` 是否满足。
3. 第 3 步有 `lsp_status` 但没有 `lsp` → 官方 tool 行或 seam 行未激活。
4. 第 4 步 `LSP_UNAVAILABLE` → `extensionToLanguage` 未覆盖该扩展名，或 provider 未被注册。
5. 第 4 步 `not found on PATH`（来自工具调用）→ 语言服务器没装；用第 5 步的 `lsp_status` 确认。
