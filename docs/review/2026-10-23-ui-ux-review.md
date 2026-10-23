# RedAI 网址导航 · UI/UX 设计评审与动效方案

- **评审对象**：`dsh-plugin-redai-nav@0.6.0`（`lib/client.js` 1340 行，8 组 88 站 + 插件榜 12 条）
- **宿主**：DeepSeek Harness 0.2.1-rc.2（`--dsw-alias-*` 语义 token、0.5px 边框、8/10/14 圆角、13px 基准字号）
- **评审方法**：Nielsen 十项启发式 + 键盘全流程走查 + 动效参数比对（`impeccable` 动效准则）
- **配套原型**：`docs/review/motion-lab.html`（可交互动效实验室，含 1x / 0.2x 慢放、降级模式、明暗切换）

---

## 0. 结论先行

**这个面板的"工程克制"是 8.5 分，"交互闭环"只有 5.5 分。**

它已经赢过绝大多数 DSH 插件：只依赖两个公开插槽、只用语义 token、CSS 前缀隔离、零联网。问题不在审美，而在三处**结构性缺口**：

| 缺口 | 具体表现 | 代价 |
|---|---|---|
| **反馈不闭环** | toast 不自动消失且 sticky 遮挡内容；收藏只有字形切换；打开站点后无任何确认 | 用户不确定"刚才那一下生效了吗" |
| **键盘不闭环** | 焦点离开搜索框即失效；详情页无 Esc 返回；方向键选中项不滚入视口 | 目标用户是键盘流，这是核心承诺 |
| **结果不可预判** | 同一张卡片，有的进详情、有的直接开；Ctrl+点击被吞 | 每次点击都是一次小赌博 |

| 维度 | 分数 | 说明 |
|---|---|---|
| 与宿主视觉一致性 | 9.0 | token 使用克制、边框与圆角贴合 shell |
| 信息密度与扫读效率 | 8.0 | 210px 网格 + 13/11px 双行，扫读成本低 |
| 键盘可达性 | 5.5 | 输入框之外无键盘路径 |
| 状态反馈 | 5.0 | 无 toast 生命周期、无动效层 |
| 可预判性 | 6.0 | 点击二义性未标注 |
| 容错与撤销 | 5.5 | 删除与清空均不可撤销 |
| 空态与引导 | 5.0 | 空态只有一句话，不提供行动 |
| 可访问性 | 6.5 | aria-label 齐全，但缺 tab 语义与活区播报 |
| 手感（动效） | 4.0 | 仅 1 条 120ms 背景过渡 |

**P0 五条可在 1 小时内修完**（详见 §3），收益远大于任何新增功能。

---

## 1. 设计上下文：先确认"为谁、什么时候、多久"

### 1.1 用户不是"网民"，是"开工的人"

| 人群 | 占比推断 | 打开导航面板的真实动机 |
|---|---|---|
| 开发者 / 工程师 | 高 | 查文档、开 API 控制台、找 MCP 目录 |
| 数据分析 | 中 | 找模型榜单、比价格、开表格工具 |
| 知识工作者 | 中 | 换一个模型再问一次、找资料源 |
| 插件作者 | 低但高价值 | 看插件榜、抄别人的权限声明写法 |

### 1.2 三个使用时刻（决定了设计承诺）

| 时刻 | 用户心理 | 设计必须做到 | 当前是否做到 |
|---|---|---|---|
| **开工**：任务开始，要去某个站 | "别让我找，我已经知道我要去哪" | 三次击键内到达；能盲打 | 部分（搜索可，但键盘不闭环） |
| **中断**：主对话卡住，换个模型 | "顺手一开，顺手一关" | 打开即就绪、关闭无残留状态 | 是（自动聚焦做得好） |
| **收尾**：收藏、导出、清理 | "别让我确认三遍，也别让我误删" | 可撤销、确认不啰嗦 | 否（无撤销、确认会超时失效） |

### 1.3 三条设计推论

1. **密度优先于留白**：面板是次要表面，用户不想滚动，不代表想要"呼吸感"。当前 210px 网格的密度是对的，不要往"卡片化、大圆角、大留白"走。
2. **键盘优先于鼠标**：这类用户的手 90% 时间在键盘上，鼠标是"离开键盘"的成本。任何只能用鼠标完成的动作都是缺陷。
3. **瞬时反馈优先于装饰动画**：记忆点必须"零打扰、可复现、携带信息"。见 §6 的取舍标准。

---

## 2. 现状盘点

### 2.1 结构

```
.redaiNavPage (height:100%; overflow:auto)
├── .redaiNavHead        sticky top:0   [搜索框][计数][+][⋯]  ← 唯一 sticky
├── .redaiTabs                          [网址 89][插件榜 12]  ← 滚走即消失
├── .redaiNavAdd         条件渲染        添加表单（名称 + 网址 + ✓/×）
├── .redaiNavRecent      条件渲染        最近打开 chips（≤8）
├── .redaiBanner         条件渲染        首屏通栏（可关闭，持久化）
├── .redaiNavBody
│   └── section × 8                      h3 组名 + 计数 + grid(210px)
│       └── a.redaiNavCard × n           tile / title+pill / desc / ☆ / ×
├── .redaiNavFoot                       "内置清单 · 设计参考整理自 WebStackPage"
├── input[type=file]     隐藏            导入
└── .redaiNavNotice      sticky bottom  提示条 ← 永不过期
```

**详情页是例外**：`SiteDetail` / `PluginDetail` 直接返回 `.redaiDetail`，**没有包在 `.redaiNavPage` 里**（`NavPage` 里两个详情分支）。这意味着详情页失去了 `height:100%; overflow:auto` 和页面背景，滚动依赖祖先容器——而在 DSH 里 `main` 槽位的容器默认不滚动（正因如此列表页才自己声明 `overflow:auto`）。短窗口下打开 DeepSeek 详情（3 段简介 + 4 场景 + 5 步骤）大概率**到底部无法继续滚动**。这是本轮最需要实测确认的结构问题。

### 2.2 交互清单（已实现）

| 能力 | 入口 | 键盘 | 备注 |
|---|---|---|---|
| 搜索 | 输入框 | 自动聚焦；↑↓ 选择、Enter 打开、Esc 清空 | 键位全部绑在输入框上 |
| 打开站点 | 点卡片 / Enter | 有 | 走右侧栏 browser tab，失败回退 `window.open` |
| 收藏 | ☆ 按钮 | Tab 可达 | 无动效、无撤销 |
| 添加 | `+` | 网址框内 Enter 提交 | 无字段级校验反馈 |
| 导入导出 | `⋯` 菜单 | Tab 可达 | 菜单无点击外部关闭 |
| 清空 | `⋯` 内两段式 | 可达 | `armed` 状态无超时 |
| 详情 | 点有 `details.json` 的卡片 | 无返回键 | Esc 失效（输入框不在 DOM） |
| 插件榜 | Tab 切换 | 无键盘导航 | 不可筛选、命令不可复制 |

### 2.3 现有动效基线

全站只有一处：`.redaiNavCard{transition:background .12s ease}`（`src/components.js` 的 `cssSites`）。这是一个**正确的零基线**——没有乱加装饰。以下所有建议都是在这个基线上补"反馈层"，不是加"表演层"。

---

## 3. P0：五条当天可修（每条 ≤ 20 行）

### UX-01 · 提示条永不消失，且遮挡最后一行内容　`P0`
- **位置** `NavPage` 的 `notice` 状态与 `notify()`、`Toast` 组件；CSS `.redaiNavNotice`（`src/components.js` 的 `cssSites`）
- **现象** `setNotice(...)` 之后没有任何清除逻辑。提示条 `position:sticky;bottom:0`，浮在滚动容器底部，遮住最后一行卡片。
- **影响** 用户看到"已保存到本地"停在屏幕上直到下次操作；同时底部一条永久残留（截图里没有，因为预览静态未触发）。
- **建议** 改 toast：3.2s 自动消失 + 手动 ×；入场 `translateY(4px)+opacity` 180ms，出场 140ms；`role="status" aria-live="polite"`；容器 `bottom:16px` 居中浮动，不再 sticky 挤压内容。
```jsx
const [notice, setNotice] = React.useState(null)
const notify = (text, tone = 'info') => setNotice({ text, tone, id: Date.now() })
React.useEffect(() => {
  if (!notice) return
  const id = setTimeout(() => setNotice(null), 3200)
  return () => clearTimeout(id)
}, [notice])
```

### UX-02 · Ctrl / ⌘ + 点击被吞掉　`P0`
- **位置** `SiteCard` 的 `onCardClick`（无条件 `preventDefault`）
- **现象** `<a href>` 本来支持"新标签打开"，但处理函数吃掉默认行为后一律进右侧栏。
- **影响** 开发者最常用的"我想在系统浏览器里开这个"直接失效，且没有任何替代路径。
- **建议** 修饰键放行，并在 UI 上明确承诺这一行为：
```jsx
onClick: (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey) return  // 交给浏览器/系统
  event.preventDefault()
  onActivate(link)
}
```
加一条 i18n 提示（详情页底部或 `⋯` 菜单）："Ctrl / ⌘ + 点击在系统浏览器中打开"。

### UX-03 · "清空本地数据"的确认态永不超时　`P0`
- **位置** `NavPage` 的 `clearAll()`、`NavPage` 的 `armed` 状态与 `⋯` 菜单渲染
- **现象** 第一次点击把按钮文案改成"再点一次确认清空"，此状态**没有超时**；同时 `⋯` 菜单点了外面不会关闭，菜单可以一直挂在那里。
- **影响** 用户点了一次、被消息打断、回来再点一次——以为还是"第一次"，实际数据已被清空。这是不可逆的数据丢失路径。
- **建议** 三重保险：① 4s 超时自动复位；② 确认态换色（`--dsw-alias-state-warn-label`）并加 1px 警示描边；③ 清空后 toast 提供 5s"撤销"（把 `emptyStore()` 前的快照塞进 toast 的 action）。
```jsx
React.useEffect(() => {
  if (!armed) return
  const id = setTimeout(() => setArmed(false), 4000)
  return () => clearTimeout(id)
}, [armed])
```

### UX-04 · 键盘流在焦点离开搜索框的那一刻断掉　`P0`
- **位置** `NavPage` 的 `handleKey()`（键盘层只挂在搜索 `<input>` 上）、搜索框渲染
- **现象** 自动聚焦让"打开即键盘"成立；但点一次星标后焦点落到 ☆ 按钮，此后 ↑↓ / Enter / Esc 全部失效。更严重的是**详情页根本不在 DOM 里渲染搜索框**，所以 Esc 无法返回列表。
- **影响** "键盘直达"是 README 里写下的承诺，现在只在最理想路径下成立。
- **建议** 把键盘层提升到页面容器：`.redaiNavPage` 与 `.redaiDetail` 都挂 `onKeyDown`（或用 `window` 监听 + 白名单），输入中（`event.target` 是 input 且非 Esc）时忽略；详情页 `Esc` / `Backspace` 返回，`Enter` 访问。焦点上用 roving tabindex，别让 Tab 逐个穿过 88 张卡片的 ☆ 按钮。
```jsx
// 页面级键盘层（列表 + 详情共用）
const onPageKey = (e) => {
  if (e.target instanceof HTMLInputElement && e.key !== 'Escape') return
  if (view && e.key === 'Escape') { setView(null); return }
  ...
}
```

### UX-05 · 方向键选中项跑出视口不跟随　`P0`
- **位置** `NavPage` 里 `-[active]` 的 effect（`setActive` 后无滚动）、`SiteCard` 的 `data-active`
- **现象** 卡片有 `.redaiNavCardActive` 高亮，但按 8 次 ↓ 之后高亮跑到了屏幕外，用户什么都看不见。
- **影响** 键盘选择在视觉上"断线"，这是键盘化列表的经典失败模式。
- **建议** 用 ref 记录当前项，`scrollIntoView({ block: 'nearest' })`；滚动容器是 `.redaiNavPage`，`nearest` 会自动只滚最小距离，不会把 sticky 头甩掉。若做 sticky 组标题，改用 `scroll-margin-top: 96px`。

---

## 4. P1：影响"用起来顺不顺"的七个问题

### UX-06 · 同一张卡片，点击结果有两种　`P1`
- **位置** `NavPage` 的 `activate()`（有 `DETAILS` 就进详情）
- **现象** 有 `details.json` 的进详情页，没有的直接打开站点。README 把"无需标注"当成设计优点，但从用户侧看：**同样的外观，两种后果，且无法预判**。更麻烦的是"进详情页"其实是一次绕路——用户想打开 DeepSeek，却先看到一屏介绍。
- **建议** 卡片主点击一律"打开"，详情改为显式次级入口。三个方案权衡：

| 方案 | 主点击 | 详情入口 | 优点 | 缺点 |
|---|---|---|---|---|
| A（推荐） | 打开站点 | 卡片右侧 `ⓘ`（hover 出现，与 ☆ 并列） | 后果唯一、直达 | 多一个控件 |
| B | 进详情 | 详情页主按钮"访问网站" | 保留"先读后点" | 每次多一跳 |
| C | 拆左右两个热区 | 左侧缩略图→详情，右侧文字→打开 | 无新增控件 | 热区语义隐晦 |

推荐 A：在卡片右上角（hover / focus-visible 时）浮出 `ⓘ`，把现在的 `activate` 逻辑挪过去；卡片点击直接 `visit`。这同时解决了"点了不知道去哪"和"想去详情却直接跳走"两个方向的问题。

### UX-07 · 详情页丢失滚动容器与返回路径　`P1`
- **位置** `SiteDetail` 与 `PluginDetail` 返回的根节点（`.redaiDetail`）、`NavPage` 里返回详情时的外壳
- **现象** 详情根节点是 `.redaiDetail`（`padding:18px 24px 40px;max-width:760px`），没有 `height:100%; overflow:auto`，也不带 `.redaiNavPage` 类；返回按钮在 DOM 顶部，滚下去就看不见。
- **建议** 统一页壳：`<div class="redaiNavPage"><div class="redaiDetail">…`；返回按钮做成 `position:sticky;top:0` 的窄条，或彻底改为"面包屑 + Esc"；同时保留 tab 栏，让用户知道自己在哪一层。**返回列表时恢复滚动位置**（`useRef` 存 `scrollTop`，`useEffect` 里还原）。

### UX-08 · 计数自相矛盾　`P1`
- **位置** `NavPage` 的 `total`（去重）、`NavPage` 的组标题计数（`groupCount`）、`data/i18n.json` 的 `banner.desc`
- **现象** 三处数字口径不同：顶部 89、banner 文案写死"88 个站点"，而"我的收藏"里的站点同时算进原分组，分组计数相加 ＞ 89。搜索时顶部数字会变，但文案仍是"个站点"。
- **建议** ① banner 文案改用 `fill()` 注入 `{n}`/`{g}`，禁止硬编码；② 搜索时文案改为 `12 / 89`；③ 组计数在搜索态显示 `命中 n / 共 m`；④ 收藏组用 `aria-describedby` 或淡色标注"与原分组重复"，避免"怎么有两个"的困惑。

### UX-09 · 空态只有一句话，不提供出路　`P1`
- **位置** `NavPage` 的 `siteEmpty`（空态渲染）、CSS `.redaiNavEmpty`
- **现象** 无结果时只有居中一行"没有匹配的网址"。
- **建议** 把失败变成资产：空态给三行——① 原搜索词 + "添加为网址"（预填 title=关键词，Enter 直接落库）；② "去插件榜搜「{q}」"（切换 tab 并带入 query）；③ 热门标签（收藏最多 / 近期新增）四条。空态是唯一"用户愿意读文案"的时刻，不要浪费。

### UX-10 · 删除与清空都不可撤销　`P1`
- **位置** `NavPage` 的 `remove()`、`NavPage` 的 `clearAll()`、`Toast` 组件
- **现象** 自定义站点的 `×` 一点即删，无确认无撤销；清空靠"再点一次"。
- **建议** 破坏性操作统一走 **toast + 撤销**（5s），比确认框轻、比无保护好：`notify('已删除「公司内网」', { undo: prevStore })`。

### UX-11 · 插件榜最大的差异化没有交互　`P1`
- **位置** `NavPage` 的 `pluginBody`（筛选条与计数）、`PluginDetail` 的安装行、`PluginCard`
- **现象** `host` 三态（零宿主端 / 含宿主端 / 未核查）是这个榜单唯一"别人没有"的信息，但只能靠肉眼逐行扫；安装命令是一段不可复制的 `<code>`。
- **建议** ① 顶部加 3 枚筛选 chips（`全部 12 / 零宿主端 1 / 未核查 8 / 含宿主端 3`），切换后列表 FLIP 重排；② `code` 块点击复制，右侧 ✓ 600ms 回落，`aria-live` 播报"已复制"；③ 排序切换：按星标 / 按最近提交（`pushed` 倒序，这才是"还在维护"的信号）。

### UX-12 · hover 态与键盘选中态用同一个 token　`P1`
- **位置** CSS `.redaiNavCard:hover` 与 `.redaiNavCardActive`（`src/components.js` 的 `cssSites`，同一行选择器）
- **现象** 两者都是 `--dsw-alias-interactive-bg-hover`，键盘移动时与鼠标悬停视觉等价，用户分不清"光标在哪"和"手在哪"。
- **建议** 拆开：hover 用现有 hover 底；active 用 `color-mix(brand 8%)` 底 + 左侧 2px 品牌竖条（DSH 侧栏选中态就是竖条语言，见 §6 方案 2）。

---

## 5. P2：规范与边缘情况

| ID | 问题 | 位置 | 建议 |
|---|---|---|---|
| UI-13 | 硬编码颜色绕过 token：`#e0a000`（星标）、`#e5484d`（hot）、`#2f9e68`（new） | `cssSites` 的 `.redaiTagPill.hot/.new`、`.redaiNavStar.on`、`Banner` 的 `<text fill>` | 改 `light-dark()` + `color-mix()`，暗色下才不会糊 |
| UI-14 | 触控目标过小：☆ 22px、× 20px、chip 22px | `.redaiNavStar`、`.redaiNavDel`、`.redaiNavChip` | 视觉尺寸可保留，热区用 `::after{inset:-4px}` 撑到 ≥28px |
| UI-15 | 缺 tab 语义与活区播报 | `NavPage` 的 `tabs` 渲染 | `role="tablist"/"tab"/"tabpanel"` + `aria-selected`；搜索计数 `aria-live="polite"` |
| UI-16 | 窄面板下头部挤压（搜索框 flex:1 + 计数 + 两按钮） | `.redaiNavHead` | `@container (max-width:520px)` 隐藏计数文案、按钮收进 `⋯` |
| UI-17 | 首屏三处条件区块造成布局跳动（banner 关闭 / recent 出现 / notice） | `NavPage` 的条件区块（`banner` / `recentBar` / `Toast`） | 区块用 `grid-template-rows: 0fr→1fr` 或固定占位过渡 |
| UI-18 | 88 站无方位感，组标题不 sticky | `.redaiNavGroupTitle` 与 `NavPage` 的组标题渲染 | 组标题 `position:sticky; top:56px`，右侧显示 `3 / 8` 进度 |
| UI-19 | 搜索不认别名与首字母（输入 `gh` 找不到 GitHub） | `matches()`（`src/store.js`） | `links.json` 加可选 `alias: ["gh","github"]`，匹配时并入；域名段也参与匹配 |
| UI-20 | 搜索框 `type=search` 的原生 Esc 清除与自定义 Esc 可能双触发 | 搜索 `<input>` 与 `NavPage.handleKey` | 统一在 `onKeyDown` 内 `preventDefault`，或改 `type=text` + 自绘清除按钮 |
| UI-21 | `⋯` 菜单无"点击外部关闭" | `⋯` 菜单渲染（`NavPage` 的 `mode === 'menu'`，v0.7.0 已修） | 挂一次性 `pointerdown` 监听，或用宿主 `ui-primitives` 的 popover |
| UI-22 | 首屏 banner 与"最近打开"信息重叠度高 | `NavPage` 的 `banner` 与 `recentBar` | 3 次访问后自动收起 banner（行为触发，而非只靠用户点 ×） |

**边缘情况补充**：自定义站点标题超长（60 字）会撑破 tile 与 title 行——已有 `ellipsis`，但 `title` 属性缺失，无法看全；建议 `title={link.title}`。空标题导入被 `isValidLink` 挡住（好），但重复 URL 静默去重、无反馈（应提示"已跳过 3 条重复"）。

---

## 6. 记忆点：六个动效方案

### 6.1 先定取舍标准（否则会做成"AI 味动效"）

面板停留 3–15 秒，任何动画都在**偷用户的时间**。一个动效值得存在，必须同时满足：

1. **携带信息**（告诉我"发生了什么"，而不是"这里很酷"）；
2. **可复现**（第 100 次触发仍不烦）；
3. **不阻塞**（0 帧延迟响应，动画只是事后修饰）；
4. **可降级**（`prefers-reduced-motion` 下退化为透明度变化）。

按此标准，先明确**不做**的五件事：

| 不做 | 原因 |
|---|---|
| 卡片 3D 倾斜 / 视差跟随 | 与 DSH 的静态、扁平表面语言冲突，且在密集网格里会晃眼 |
| 骨架屏 / 假加载 | 数据全在内存，制造假延迟是欺骗 |
| 弹簧 / 回弹缓动（spring） | 玩具感；开发者对"Q 弹"极度敏感，一次就够毁掉专业感 |
| 收藏时全屏彩带 / 庆祝 | 收藏是日常动作，不是成就解锁 |
| 打字机光标 / 呼吸光效 | 持续动效在阅读区等于噪声 |

### 6.2 六个方案

> 全部可在 `docs/review/motion-lab.html` 里实时触发，支持 1x / 0.2x 慢放对照。

#### 方案 1 · 星尘收藏（Star Dust）　★ 首选记忆点
| 项 | 内容 |
|---|---|
| **触发** | 点击 ☆（收藏）/ 再次点击取消 |
| **参数** | 字形 `scale .86 → 1.14 → 1`，240ms，`cubic-bezier(.16,1,.3,1)`；4 颗 2px 尘埃沿 45° 扇形飞出 `translate(6~9px)`，380ms 同曲线，`opacity .9 → 0`，`scale → .4` |
| **预期效果** | 把"状态切换"变成"一次被确认的动作"；金色是全站唯一暖色，天然成为记忆锚点。取消收藏只做 `scale .9`（140ms），不喷尘——破坏性动作不该有奖励感 |
| **与 DSH 一致性** | 不新建色板，星色取 `light-dark(#d99a00,#f0b429)`；动效时长落在 DSH 的 120–260ms 区间；不用弹簧 |
| **实现要点** | 纯 CSS：`@keyframes` + 4 个 `i` 元素，`--dx/--dy` 用 `nth-child` 给值；容器 `position:absolute; inset:0; pointer-events:none; contain:strict`。零 JS 计时、零 canvas |
| **降级** | `reduce` 下只保留 80ms 颜色过渡 |

#### 方案 2 · 键盘光标（Cursor Rail）
| 项 | 内容 |
|---|---|
| **触发** | ↑ ↓ 移动；Tab 进入卡片区 |
| **参数** | 左侧 2px 竖条 `scaleY 0→1`，120ms；底色 `color-mix(brand 8%)`；卡片 `translateX(1px)` 80ms；右侧 `↵` 提示 140ms 淡入；`scrollIntoView({block:'nearest'})` |
| **预期效果** | 用户在文件树 / 命令面板里练了十年的肌肉记忆被直接复用——"光标在哪"永远是同一个视觉符号。这是**最便宜的高级感**：0 装饰，纯语义 |
| **与 DSH 一致性** | 左侧竖条就是 DSH 侧栏选中态的语言（`.row.on`），复用它等于说"我们还是一家人" |
| **实现要点** | `::before{content:"";left:0;top:6px;bottom:6px;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}`；卡片已有 `position:relative` 与 11px 左内边距，竖条正好落在 padding 里，不挤压内容 |
| **降级** | 只留底色 + 1px 描边 |

#### 方案 3 · 数字滚动（Odometer Count）
| 项 | 内容 |
|---|---|
| **触发** | 搜索输入 / tab 切换导致计数变化 |
| **参数** | 旧值 `translateY(0→-100%)`、新值 `translateY(100%→0)`，140ms，`cubic-bezier(.25,1,.5,1)`；容器 `overflow:hidden`，固定行高 18px |
| **预期效果** | 让"89 → 12"这个**因果**被看见。静默替换数字时，用户不知道搜索是否生效；滚动 140ms 就足够建立因果 |
| **与 DSH 一致性** | 不改变排版（等宽数字 + `tabular-nums`），不产生位移；这是"信息动效"不是"装饰动效" |
| **实现要点** | React 用 `key={n}` 触发重挂载 + CSS 动画；不要用 `requestAnimationFrame` 计数器（会掉帧且不可降级） |
| **降级** | 直接切换文本 |

#### 方案 4 · 域名浮出（Domain Reveal）
| 项 | 内容 |
|---|---|
| **触发** | 卡片 hover / 键盘选中 |
| **参数** | 描述行 `opacity 1→0, translateY(0→-2px)`；域名行 `opacity 0→1, translateY(2px→0)`；各 130ms，`ease-out`；同一行内绝对定位叠放，行高不变 |
| **预期效果** | 一行承载两条信息，**高度零增长**。解决"同名站点怎么选"（多个 DeepSeek 入口、多个 GitHub 镜像）——鼠标停一下就知道去向 |
| **与 DSH 一致性** | 不改变布局与密度，过渡小于 140ms，属于"状态反馈"而非"动画" |
| **实现要点** | `.redaiNavMetaLine{position:relative;height:16px}`，两个 span 绝对定位；`@media (hover:none)` 下禁用（触屏无 hover） |
| **降级** | 直接切换文本 |

#### 方案 5 · 交接确认（Handoff）
| 项 | 内容 |
|---|---|
| **触发** | 点击卡片打开站点（内容进右侧栏） |
| **参数** | 卡片向 → 位移 4px 后回位，160ms；同时 0.5px 品牌色内描边 `opacity 0→1→0`；卡片尾部 `→` 滑出 2px |
| **预期效果** | 右侧栏在另一个视觉焦点区，点击后主面板"什么也没发生"。这个 160ms 的位移是**方向性隐喻**："东西已经送到右边去了"。比 toast 轻，比无声好 |
| **与 DSH 一致性** | 位移 ≤ 4px、无缩放、无阴影膨胀；`0.5px` 描边与全站边框厚度一致 |
| **实现要点** | 一次 `@keyframes` 跑完（`translateX(0→4px→0)`），不占 state；用 `animationend` 清除 class |
| **降级** | 仅描边淡入淡出 |

#### 方案 6 · 筛选重排 FLIP（仅插件榜）
| 项 | 内容 |
|---|---|
| **触发** | 切换 `零宿主端 / 未核查 / 含宿主端` 筛选，或改排序 |
| **参数** | 先记 `getBoundingClientRect`，改 DOM 后反向 `transform`，再 `transform:none`，180ms，`cubic-bezier(.16,1,.3,1)`；进出场用 `opacity + scale(.98)` 120ms |
| **预期效果** | 12 条列表的重排如果瞬移，用户会丢失"我刚看的那条去哪了"；FLIP 让 12 个元素同时可追踪 |
| **与 DSH 一致性** | 仅 transform，不触发布局；180ms 落在"层级变化"档 |
| **实现要点** | 12 条以内可手写 FLIP，无需依赖；`prefers-reduced-motion` 直接跳过测量 |
| **降级** | 无动画直接重排 |

### 6.3 参数规范（与 DSH 对齐后建议固化为 token）

| 层级 | 时长 | 缓动 | 用途 |
|---|---|---|---|
| 反馈 | 80–120ms | `cubic-bezier(.25,1,.5,1)` | hover、按下、光标移动 |
| 状态 | 120–200ms | `cubic-bezier(.16,1,.3,1)` | 收藏、选中、描边、计数 |
| 层级 | 180–260ms | `cubic-bezier(.16,1,.3,1)` | 重排、详情进出、菜单 |
| 入场（一次性） | 260–320ms | `cubic-bezier(.16,1,.3,1)`，30ms 间隔 stagger | 首屏分组 |

硬约束：位移 ≤ 8px；`scale` ∈ [0.96, 1.06]；**禁止** spring / bounce / elastic；任何动画不得晚于用户操作 1 帧启动（动画只做修饰，不做阻塞）。

```css
@media (prefers-reduced-motion: reduce) {
  .redaiNavPage *, .redaiNavPage *::before, .redaiNavPage *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

---

## 7. 落地顺序

| 批次 | 内容 | 预估 | 验收标准 |
|---|---|---|---|
| **第一批（P0）** | UX-01～05 | 半天 | 纯键盘完成"搜索→选择→打开→返回→收藏→撤销"不离开键盘；焦点环可见率 100% |
| **第二批（P1）** | UX-06～12 + 方案 1/2/3 | 1–2 天 | 任意点击后果唯一；详情页可滚动、可 Esc 返回；删除可撤销 |
| **第三批（P2）** | §5 规范项 + 方案 4/5/6 | 1 天 | 暗色主题下无硬编码颜色残留（`grep '#[0-9a-f]{6}' lib/client.js` 只剩 SVG/brand 兜底） |
| **第四批** | 拆文件（esbuild，不 minify） | 0.5 天 | `client.js` 已 1340 行，逼近 1500 阈值；按 `store / components / page / plugin` 拆四个模块，产物保留可审计性 |

**建议新增的测试**（沿用 `test/smoke.mjs` 的纯函数路线）：
- `notify()` 在 3200ms 后自动清空（假时钟）；
- `armed` 在 4000ms 后复位；
- `mergeImport` 返回被跳过的重复条数（用于"已跳过 N 条"文案）；
- 每组 `count` 之和 ≥ `total`（口径一致性断言）；
- i18n 字典中不含硬编码数字（`banner.desc` 必须出现 `{n}`）。

---

## 附录：动效实验室

`docs/review/motion-lab.html` 是本文档 §6 的可执行版本：左侧是 1:1 还原的浮动面板（真实搜索、键盘光标、星标星尘、计数滚动、域名浮出、交接确认、空态引导、插件榜筛选 FLIP），右侧是实时事件日志（记录每次触发的动效名与参数）。顶部三个开关：

- **1x / 0.2x**：慢放用于审查曲线与时长（所有动画走同一个 CSS 变量 `--t-scale`）；
- **动效 / 降级**：模拟 `prefers-reduced-motion`，确认降级路径可用；
- **亮 / 暗**：确认 `light-dark()` 取色在两种主题下都成立。

它只是规范原型，不是发货代码；落进 `lib/client.js` 时仍需遵守单文件、零依赖、token 化的约束。
