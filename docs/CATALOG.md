Status: not submitted — installation verification pending

# Catalog submission material

给 awesome-dsh-plugin 的现成材料（尚未提交 PR）。

## 基本信息

- **仓库**：https://github.com/leiboss/dsh-wiring
- **npm 包名**：GitHub only（未发布到 npm；当前 `private: true`，作用域 `@local`）
- **分类建议**：`dev`

## 标题与描述

**中文**

> dsh-wiring — 接通 DSH 已发布但未挂载的能力（LSP / Browser / Webhook），并用只读诊断解释缺什么。

**English**

> dsh-wiring — Wire DSH capabilities that ship but are not mounted (LSP / Browser / Webhook), with read-only diagnostics that explain what is missing.

## 能力声明

- `fs-read`：存在性探测（语言服务器、Chromium 候选路径）。
- `env`：读取浏览器路径相关环境变量（`PROGRAMFILES`、`PROGRAMFILES(X86)`、`LOCALAPPDATA`）。

不写 profile、不写文件、不联网。

## 安装

本地目录（DSH 会话内）：

```text
plugin_manager  action: install_bundle  target: "/absolute/path/to/dsh-wiring"
```

或：

```sh
dsh plugin add github:leiboss/dsh-wiring
```

## 差异化

1. 挂载的是官方包，不新增工具面；价值在失败可解释与默认值。
2. 每个能力都有只读诊断工具（`lsp_status` / `browser_status` / `webhook_status`），失败时给出可复制的修复命令。
3. 危险能力默认关闭：Playwright provider 与签名 webhook 入口都在 patch 里 `disabled: true`，由 R8 与测试守卫。
