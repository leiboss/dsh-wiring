Status: ready to submit — install verified (tarball) and LSP navigation verified; webhook ingress and browser provider remain opt-in.

# Catalog submission material

给 awesome-dsh-plugin 的现成材料（尚未提交 PR）。

## 基本信息

- **仓库**：https://github.com/leiboss/dsh-wiring
- **npm 包名**：`@leiboss/dsh-wiring`（v0.3.3；发布前仍可用 tarball 安装）
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

```text
# 推荐：按包名安装（发布后可用）
plugin_manager  action: install_bundle  target: "@leiboss/dsh-wiring@0.3.3"
```

```sh
# 备选：从源码打 tarball（已验证）
pnpm pack
plugin_manager  action: install_bundle  target: "<绝对路径>/leiboss-dsh-wiring-<version>.tgz"
```

备选：直接从 GitHub 安装（需 git 与网络；**未在本仓库验证**，且请显式用 `git+https`，`github:` 简写默认走 SSH）：

```sh
dsh plugin add git+https://github.com/leiboss/dsh-wiring.git
```

> 目录安装（`install_bundle target="<目录>"`）**不受支持**：pnpm 以 `link:` 挂载，不安装本包的 7 个官方依赖，相关行会 `ERR_MODULE_NOT_FOUND`。详见 [INSTALL.md](INSTALL.md)。

## 差异化

1. 挂载的是官方包，不新增工具面；价值在失败可解释与默认值。
2. 每个能力都有只读诊断工具（`lsp_status` / `browser_status` / `webhook_status`），失败时给出可复制的修复命令。
3. 危险能力默认关闭：Playwright provider 与签名 webhook 入口都在 patch 里 `disabled: true`，由 R8 与测试守卫。

## PR 正文（可直接粘贴）

````markdown
### dsh-wiring

https://github.com/leiboss/dsh-wiring

- 分类：`dev`
- 中文：dsh-wiring — 接通 DSH 已发布但未挂载的能力（LSP / Browser / Webhook），并用只读诊断解释缺什么。
- English: dsh-wiring — Wire DSH capabilities that ship but are not mounted (LSP / Browser / Webhook), with read-only diagnostics that explain what is missing.

#### 安装

```text
# 推荐：按包名安装（发布后可用）
plugin_manager  action: install_bundle  target: "@leiboss/dsh-wiring@0.3.3"
```

```sh
# 备选：从源码打 tarball
pnpm pack
plugin_manager  action: install_bundle  target: "<绝对路径>/leiboss-dsh-wiring-<version>.tgz"
```

或直接从 GitHub 安装：

```sh
dsh plugin add git+https://github.com/leiboss/dsh-wiring.git
```

（需 git 与网络；`github:` 简写默认走 SSH，未验证。）

#### 能力声明

- `fs-read`：存在性探测（语言服务器、Chromium 候选路径）。
- `env`：读取浏览器路径相关环境变量（`PROGRAMFILES`、`PROGRAMFILES(X86)`、`LOCALAPPDATA`）。

不写 profile、不写文件、不联网。

#### 差异化

1. 挂载的是官方包，不新增工具面；价值在失败可解释与默认值。
2. 每个能力都有只读诊断工具（`lsp_status` / `browser_status` / `webhook_status`），失败时给出可复制的修复命令。
3. 危险能力默认关闭：Playwright provider 与签名 webhook 入口都在 patch 里 `disabled: true`，由 R8 与测试守卫。
````
