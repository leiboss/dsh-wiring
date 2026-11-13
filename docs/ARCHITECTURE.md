# 架构

一页以内的接手说明。按顺序读，不需要先读源码。

## 1. 三层 + 一个独立插件

| 层 | 位置 | 职责 |
|---|---|---|
| 声明层 | `cordis.patch.yml` | 往 profile 根插入行：谁挂载、谁禁用、初始配置。行顺序不承载加载语义。 |
| 引擎层 | `src/index.js` | 把能力描述符变成只读工具：`runChecks` / `defineStatusTool` / `formatReport` / `apply`。 |
| 能力层 | `src/capabilities/*.js` | 纯数据描述符：id、标题、爆炸半径、默认值、hint、检查项。不 import 宿主包。 |

规则是**独立的子路径插件** `src/rule.js`（`exports["./rule"]`），通过 `inject: ['webhookRuntime']` 等运行时，不与引擎共享状态。这样 doctor 不会因为缺少 `webhookRuntime` 而无法加载。

## 2. 爆炸半径决定默认值

| blastRadius | 默认 | patch |
|---|---|---|
| `tool` | 可以 `defaultEnabled: true` | 无需禁用 |
| `session` / `ingress` | 必须 `defaultEnabled: false` | 对应行必须 `disabled: true` |

`scripts/check.mjs` 按能力模块遍历校验这条规则；`test/browser.test.mjs` 与 `test/webhook.test.mjs` 另有行块级断言。默认值由影响面决定，**不由本机是否装了 Chrome / 是否有 secret 决定**。

## 3. 引擎契约

- `Check.kind` 四种：`command`（PATH 解析）、`path`（单个绝对路径）、`paths`（候选路径任一命中）、`service`（`ctx.get(name)`）。
- 报告固定五个键：`capability` / `ok` / `checks` / `hint` / `next`；`hint` 为空时 `formatReport` 不多输出任何字符。
- 每个探测有独立超时（默认 1500ms），超时只落入 `detail`，**`execute` 永不 reject**。
- 不得 `import '@deepseek-ai/*'`；宿主包只通过 patch 行挂载。

## 4. 加一个能力的 4 步配方

1. **模块**：新建 `src/capabilities/<id>.js`，导出 `capability`（id、双语标题、blastRadius、defaultEnabled、hint、checks）。
2. **注册**：`src/index.js` 的 `capabilities` 数组追加该模块（顺序即展示顺序）。
3. **patch**：`cordis.patch.yml` 的 `- insert:` 列表补行，id 用 `wiring-` 前缀；危险能力写 `disabled: true`。
4. **locale / 测试 / README**：两个 locale 加 `capabilities.<id>.title`，新增 `test/<id>.test.mjs`（描述符 + execute 两条路径 + 行块安全断言），README 能力表加一行。

## 5. 不变量

零运行时依赖、零构建、单包。`apply()` 不做 IO、不写 profile、不联网。**改引擎前先改本文档**——如果新能力需要新的 `kind`，那是一次架构变更，不是一次能力新增。
