# Changelog

## 0.1.1

- Pin the three official LSP packages to the host version line (`0.2.2-rc.1`); the `latest` dist-tag is stale and its peers cannot resolve on a 0.2.2 host.
- Normalize newlines before parsing `cordis.patch.yml`, and force LF with `.gitattributes` so a Windows checkout cannot fail the patch-header check.
- Correct the README install command (`action` + `target`) and document that missing-peer warnings are expected.

## 0.1.0

- 首次发布：把官方 `@deepseek-ai/dsh-lsp`、`dsh-lsp-stdio`（仅 TypeScript）、`dsh-tool-lsp` 挂进 profile。
- 新增只读诊断工具 `lsp_status`：报告 seam 与 `typescript-language-server` 的可用性，失败时给出安装命令。
- 零运行时依赖、零构建；静态检查与两组单测全部命令化。
