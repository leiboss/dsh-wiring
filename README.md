# dsh-wiring

**Wire what ships. Diagnose what doesn't.**

DeepSeek Harness 0.2.2-rc.1 随 npm 发布了 `@deepseek-ai/dsh-lsp`、`@deepseek-ai/dsh-lsp-stdio`、`@deepseek-ai/dsh-tool-lsp`，但 `dsh-base` 与 `dsh-web-app` 的 patch 里没有任何 lsp 行：默认安装既没有 `lsp` 工具，也没有任何东西告诉你它为什么不在。本包把这三行接上，并提供一个只读的 `lsp_status` 诊断。

| 能力 | 状态 | 模型工具 | 诊断工具 |
|---|---|---|---|
| LSP（TypeScript 一个语言服务器） | 已接线 | `lsp` | `lsp_status` |

安装（在 DSH 会话内执行，路径必须是绝对路径）：

```text
plugin_manager install_bundle  { "path": "/absolute/path/to/dsh-wiring" }
# 重启该 profile；bundle patch 在下次启动时生效
```

验收：按 [docs/VERIFY.md](docs/VERIFY.md) 的 8 步执行，其中包含「语言服务器缺失时会话仍可创建」这一失败场景。

> 本包不重造工具面，只挂载官方包；差异点是失败可解释与默认值。

## 它做什么

- 在 profile 里插入四行：LSP seam、TypeScript provider、官方 `lsp` 工具、本包的 doctor。
- `lsp_status` 只读探测：`ctx.get('lsp')` 是否挂载、`typescript-language-server` 是否在 PATH 上。
- 失败时给出可以直接复制的安装命令；成功时报告解析到的绝对路径。
- 不写配置、不联网、不安装任何二进制、不在 `apply()` 期间做 IO。

## 它不做什么

- 不做 UI、不做配置页、不自动安装语言服务器。
- 不覆盖用户自己的 patch 行；所有行 id 都以 `wiring-` 开头。
- 不内置浏览器、webhook、TTS（见 DESIGN.md 的 Step 2/3/4）。

## 结构

```
src/index.js                引擎：runChecks / defineStatusTool / formatReport / apply
src/capabilities/lsp.js     Step 1 唯一能力描述符
cordis.patch.yml            四行挂载 + Python/Go/Rust 可复制注释块
scripts/check.mjs           静态验收（R5/R6/R8 + 包契约）
test/                       引擎与 LSP 单测（node:test）
docs/VERIFY.md              安装后人工验收
```

## 开发

```sh
node scripts/check.mjs
node test/engine.test.mjs
node test/lsp.test.mjs
```

零依赖、零构建：不需要 `npm install`。

## License

MIT
