# 街机插件游戏模块契约（所有游戏必须严格遵守）

每个游戏是 `public/games/` 下的**一个独立纯 JS 文件**，由 `index.html` 用 `<script>` 标签同步加载，外壳统一调度主循环。

## 1. 文件外壳（必须完全一致）

```js
(function (global) {
  'use strict';

  function create(host) {
    // ... 你的实现 ...
    return api;
  }

  var g = global.ArcadeGames = global.ArcadeGames || {};
  g.NAME = { id: 'NAME', title: '中文名', create: create };
})(typeof window !== 'undefined' ? window : globalThis);
```

`NAME` 为 `mario` / `contra` / `bomberman` / `loderunner`。

## 2. host 对象（外壳注入，游戏只读）

| 字段 | 说明 |
|---|---|
| `host.input` | 布尔对象：`{ left, right, up, down, a, b }`，外壳每帧更新 |
| `host.beep(kind)` | 播放音效，`kind` ∈ `'jump' \| 'shoot' \| 'hit' \| 'coin' \| 'boom' \| 'win' \| 'lose' \| 'step'` |
| `host.setHud(obj)` | 更新 HUD：`{ score, lives, extra }`，字段可省略 |
| `host.setOverlay(text)` | 在画布中央显示提示文字；传 `null` 隐藏 |

按键映射（外壳负责）：方向键/WASD → `left/right/up/down`；`Z`/`空格` → `a`；`X`/`K` → `b`。

## 3. 返回的 api

```js
var api = {
  reset() {},              // 初始化/重开一局，外壳创建后和每次重开都会调用
  update(dt) {},           // dt 为秒（约 0.016），只算逻辑，不绘制
  draw(ctx) {},            // 画一整帧
  onKey(action, isDown) {} // 可选：需要边沿触发（如"按一下放炸弹"）时实现
};
```

- `draw` 的 `ctx` 坐标原点在左上角，逻辑分辨率固定 **640×400**。
- `draw` 会被每帧调用一次，`update` 在它之前被调用。

## 4. 硬性约束

1. 逻辑分辨率 640×400，所有绘制在此坐标系内；**不要**读写 canvas 尺寸或 `window.innerWidth`。
2. 禁止 `import` / `export`、禁止 DOM API（`document`、`window` 只在文件外壳检测 `global` 时出现）、禁止外部资源（图片/音频/字体/网络）。
3. 只用 Canvas 2D 基本绘图：`fillRect`、`beginPath`/`moveTo`/`lineTo`/`arc`/`fill`/`stroke`、`fillText`、`save`/`restore`、`translate`。不要用 `roundRect`、`filter`、`letterSpacing` 等新 API。
4. 不写 `requestAnimationFrame` / `setTimeout` / `setInterval` 主循环；动画全部靠 `dt` 累积。
5. 中文字符串直接写进源码（页面 UTF-8）。
6. 纯 ES2019 语法，可用 `let/const`、箭头函数、模板字符串、解构；不要用 `??`、`?.`、类字段。
7. 单文件、**不超过 420 行**、无副作用（加载时不启动任何循环）。
8. 像素风美术全部用代码画：推荐调色板 `#0f1020 #1b1d33 #e8e8f0 #ffd24a #ff5a5a #4ad6ff #6ee06e #b06cff`。

## 5. 自测要求（交付前必须做）

1. `node --check public/games/<name>.js`
2. 写一个临时 Node 脚本，用 `vm.runInThisContext` 载入游戏文件，构造桩对象：

```js
const noop = () => {}
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : noop), set: () => true })
globalThis.ArcadeGames = {}
const host = { input: { left: 0, right: 0, up: 0, down: 0, a: 0, b: 0 }, beep: noop, setHud: noop, setOverlay: noop }
const g = ArcadeGames.NAME.create(host)
g.reset()
for (let i = 0; i < 600; i++) { host.input.right = i % 37 < 18; host.input.a = i % 53 < 3; host.input.b = i % 29 < 3; g.update(1/60); g.draw(ctx) }
```

跑完不抛异常 = 通过；再补一轮"只按 a/b/上下"的随机输入。测完删除临时脚本。

## 6. 交付报告

回复里给出：文件绝对路径、行数、`node --check` 与冒烟结果、你自己测出的已知限制（1-3 条）。不要修改 `public/games/` 以外的任何文件。
