# Security

## 运行位置

DSH bundle 是进程内插件：`apply()` 与 `lsp_status` 都运行在宿主 Node 进程里，拥有该进程的完整 Node 权限（文件系统、子进程、网络）。本包不声称提供沙箱隔离。

## 本包做什么

- `apply()` 只注册工具，不读文件、不联网、不写 profile、不调用 `configEditor`、不打印日志。
- `lsp_status` 是只读诊断：
  - 通过 `ctx.get('lsp')` 判断 seam 是否挂载；
  - 通过 `node:fs` 的 `existsSync` 判断 `path` 类检查；
  - 通过 `ctx.subprocess.resolveExecutable` 在 PATH 上解析可执行文件。
- 每条探测都有独立超时，失败只进入报告，不抛出。

## 本包不做什么

- 不自动安装任何二进制，也不执行安装命令；`install` 字段只是给人和模型看的文本。
- 不修改 `$DSH_HOME` 下的任何文件，不写 profile，不改变 bundle 启用状态。
- 不读取凭据、不联网、不发送遥测。
- 不导入任何 `@deepseek-ai/*` 包；宿主包由 Loader 行挂载。

## 信任边界

`lsp` 工具的实际行为由官方 `@deepseek-ai/dsh-lsp-stdio` 决定：它会启动配置中的语言服务器进程，信任该进程，并且不提供额外的进程沙箱。部署方需要自行确保 `command` 指向可信的可执行文件，并保证文件系统与子进程 provider 属于同一个执行世界。

## 报告

发现安全问题请勿公开提 issue，请私下联系维护者并附上复现步骤与影响范围。
