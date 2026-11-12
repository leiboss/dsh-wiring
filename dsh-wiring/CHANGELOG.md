# Changelog

## 0.1.0

- 首次发布：把官方 `@deepseek-ai/dsh-lsp`、`dsh-lsp-stdio`（仅 TypeScript）、`dsh-tool-lsp` 挂进 profile。
- 新增只读诊断工具 `lsp_status`：报告 seam 与 `typescript-language-server` 的可用性，失败时给出安装命令。
- 零运行时依赖、零构建；静态检查与两组单测全部命令化。
