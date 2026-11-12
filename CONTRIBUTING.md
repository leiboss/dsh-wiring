# Contributing

## 加一个能力（4 步）

以 Step 2 的 `browser` 为例。引擎不改；如果你发现自己需要改 `src/index.js`，先回到 DESIGN.md 讨论抽象是否错了。

### 1. 写能力模块

新建 `src/capabilities/browser.js`：

```js
export const capability = {
  id: 'browser',
  title: { en: 'Browser automation', zh: '浏览器自动化' },
  blastRadius: 'session',
  defaultEnabled: false,
  checks: [
    { id: 'seam', label: 'Browser seam', kind: 'service', service: 'mcp', install: '' },
    {
      id: 'chromium',
      label: 'Playwright Chromium',
      kind: 'path',
      path: '/absolute/path/to/chromium',
      install: 'npx playwright install chromium',
    },
  ],
}
```

`blastRadius` 不是 `'tool'` 时，`defaultEnabled` 必须为 `false`，且 patch 对应行必须写 `disabled: true`；`scripts/check.mjs` 的 R8 会交叉校验。

### 2. 注册到能力数组

`src/index.js` 顶部：

```js
import { capability as browser } from './capabilities/browser.js'
const capabilities = [lsp, browser]
```

### 3. 加 patch 行

`cordis.patch.yml` 里补 seam / provider / tool 行；doctor 行只有一行，不需要重复。行 id 继续使用 `wiring-` 前缀。

### 4. 补 locale、测试与 README

- `locale/en.json`、`locale/zh.json` 增加 `capabilities.browser.title`。
- 新增 `test/browser.test.mjs`，覆盖描述符不变量与 `execute` 的成功/失败两条路径。
- README 能力表加一行。
- CHANGELOG 增加一条。

## 本地验收

```sh
node scripts/check.mjs
node test/engine.test.mjs
node test/lsp.test.mjs
```

不要用 `node --test` 启动整个目录：受限沙箱会为每个文件 spawn 子进程并失败（`spawn EPERM`）。直接 `node <file>`。

## 硬性约束

- 零运行时依赖；不 import `@deepseek-ai/*`。
- 不写文件、不写 profile、不联网。
- 工具定义手写，`parameters` 用原始 JSON Schema，`output` 必须有 `schema` 与 `render`。
- UTF-8、2 空格缩进、LF。
