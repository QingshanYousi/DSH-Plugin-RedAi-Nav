# 插件排行榜改造规格（0.9.0）

> 决策已定：**11 个分类、折叠「娱乐」与「主题与外观」、每类前 10、未标注 topic 的收录但排后**。
> 本文是实现依据。数据侧的可行性已实测，不要重新发明。

## 1. 数据来源与已验证的事实

| 事实 | 数值/证据 |
|---|---|
| 来源列表 | `beancookie/awesome-dsh-plugin`（172★，当日活跃，topics 含 `dsh-plugin`） |
| 其结构 | 11 个 `###` 分类，508 条条目，全部带一句话描述 |
| 条目排序 | 按 owner 字母序，**不是质量排序** → 不能直接当榜单顺序 |
| 条目真实性 | 抽 10 个查 API，10/10 带 `dsh-plugin` 或 `deepseek-harness` topic |
| 星标量级 | 2★ ~ 3453★，绝大多数在 30★ 以下 |
| 批量查询 | `q=repo:a/b+repo:c/d...` 一次 10 个仓库可靠返回（实测 10/10） |
| 批量查询的坑 | 批次里只要有一条无效（改名/删除），整批返回 **422**，必须二分重试 |

**已知死链样例**：`BeiZi6/dsh-101`（列表里有、API 查不到），单条查询会 422，必须容忍。

## 2. `scripts/build-ranking.mjs`（新增）

### 2.1 流程

1. `GET https://api.github.com/repos/beancookie/awesome-dsh-plugin/readme`（`Accept: application/vnd.github.raw`）→ markdown
2. 解析：`### 分类名` 之后、下个 `###` 之前的 `- [name](url) — desc` 行；只收 `github.com/` 链接；去掉描述前导 `—`
3. 仓库元信息批量查询：
   - 每批 10 个 `repo:owner/name`，`per_page=100`
   - 请求间隔 ≥6.5s（未认证 search 限流 10 次/分钟）
   - 整批 422 → 二分；单条仍 422 → 记为 `dead`，不进榜单，但写入 `data/ranking-warnings.json` 供人工看
4. 合并：`stars / forks / pushed / archived / license / language / homepage / topics`
5. 去重：**同一仓库名被不同 owner 收录时视为 fork**，保留星标高者，另一条丢弃并计入 warnings
6. 排序（每个分类内）：
   1. 有 `dsh-plugin` 或 `deepseek-harness` topic 的在前（`tagged: true`）
   2. 组内 `stars` 降序，同分按 `pushed` 降序
   3. `archived: true` 一律沉到本类末尾
   4. 取前 10
7. 输出 `data/plugins.json`（**schema v2**）

### 2.2 产物 schema v2

```json
{
  "version": 2,
  "updatedAt": "2026-10-23",
  "source": {
    "list": "https://github.com/beancookie/awesome-dsh-plugin",
    "method": "类内按星标降序；已归档沉底；未标注 topic 的排在已标注之后",
    "rateLimit": "未经认证的 search 接口，10 次/分钟"
  },
  "categories": [
    {
      "id": "ui",
      "name": "UI 增强",
      "nameEn": "UI",
      "total": 94,
      "tagged": 15,
      "items": [
        {
          "rank": 1,
          "full": "0xsline/dsh-spotlight",
          "title": "dsh-spotlight",
          "repo": "https://github.com/0xsline/dsh-spotlight",
          "desc": "键盘优先的命令面板（command palette）",
          "stars": 23,
          "pushed": "2026-10-21",
          "archived": false,
          "tagged": true,
          "topics": ["dsh-plugin"]
        }
      ]
    }
  ]
}
```

分类 id 与显示名固定为（顺序即 UI 顺序）：

| id | name | nameEn | 折叠 |
|---|---|---|---|
| ui | UI 增强 | UI | 否 |
| session | 会话与消息 | Session | 否 |
| memory | 记忆 | Memory | 否 |
| tools | 工具与能力 | Tools | 否 |
| skills | 技能包 | Skills | 否 |
| workflow | 工作流与自动化 | Workflow | 否 |
| notify | 通知与集成 | Integrations | 否 |
| model | 模型与账号接入 | Models | 否 |
| runtime | 开发与运行时 | Runtime | 否 |
| theme | 主题与外观 | Themes | **是** |
| fun | 娱乐 | Fun | **是** |

### 2.3 其他要求

- `--offline`：只校验 `data/plugins.json` 的 schema 与排序自洽（tagged 在前、archived 在后、rank 连续、每类 ≤10），不发请求；CI 用这个。
- 不带参数：真实抓取并写回，打印每类命中数、死链数、请求次数、耗时。
- 失败安全：抓取中途失败时**不覆盖**已有 `data/plugins.json`，直接退出非零。
- 允许 `GITHUB_TOKEN` 环境变量：有 token 时请求间隔降为 0.2s（5000 次/小时）。

## 3. UI：把「列表」改成「榜」

### 3.1 结构（自上而下）

1. 搜索框 + 计数（沿用现有头部，搜索同时作用于分类名与条目名/描述）
2. 分类筛选条：`全部` + 9 个正式分类 + `更多`（展开 theme / fun），chip 显示 `名称 存活收录数`
3. **按分类分节**（`全部` 视图下逐类渲染；选中某类时只渲染该类）：
   - 节标题：分类名 + 右侧 `榜上 10 / 收录 89`（行数 / 该类存活仓库数）
   - 第 1 名：**独立大卡**（`.redaiRankTop`），序号 `01` 用 22px、品牌色，标题 14px，描述一行，元信息 `9.4k ★ · 10-23`
   - 第 2–10 名：紧凑行（`.redaiRankRow`，44px 高），序号 13px 等宽灰、标题 13px、右侧星标与日期
   - 分隔线只在行之间，末行无
   - 节底部：只放 `查看全部 →`（链到列表对应锚点），不再重复计数
4. 顶部一行排序依据：`按星标降序 · 已归档沉底 · 更新于 {date}`

> 实现后修订（2026-10-23）：`total` 取**存活仓库数**（`dead` 与丢弃的 `fork` 已排除），另存 `listed` 为来源列表原始条目数；头部与 tab 的数字是**榜上行数**，二者不是一回事。

### 3.2 视觉规则

- 排名数字必须**等宽**（`font-variant-numeric:tabular-nums`），前 10 两位补零
- 只有第 1 名用品牌色与描边，2–10 名一律灰阶——否则整页都是重点
- 第 1 名大卡高度 ≈ 76px，2–10 行 44px；两类之间不混排
- 折叠分类默认不渲染；点 `更多` 后才出现在筛选条
- 搜索命中时：显示匹配条目的分类节，节内仍按原 rank 显示（**不要重新编号**，否则"榜"被破坏）
- 空态：沿用现有 `.redaiNavEmpty`，文案带分类名

### 3.3 详情页

v2 条目没有 `why / highlights / caveats`。详情页改为：
- 头部：名称 + 一句话描述 + 分类徽章 + `tagged` 徽章（未标注时显示「未标注」）
- 指标条：`★ 23 / 复刻 4 / 语言 TypeScript / 协议 MIT / 建仓 2026-08-31`（缺失显示「未知」）
- 正文：`为什么在这` —— 一段由**数据推导**的说明（`本类第 3 名，23 星，最近一次提交 10-21，未归档`），不要伪造编辑观点
- 底部：安装命令 + `复制` + `打开仓库` +（有 homepage 时）`主页`
- 保留：仓库链接、`← 返回`

## 4. 硬约束

1. 只 `require('react')` 与 `react/jsx-runtime`；不新增依赖（`build-ranking.mjs` 用 Node 内置 `fetch`）
2. 颜色只用 `--dsw-alias-*` 或 `light-dark()` 成对值
3. 现有 324 条断言里与 v1 插件结构相关的必须**重写而不是删除**，并新增：
   - 每类 ≤10 条、rank 从 1 连续
   - `tagged` 全部排在未标注之前
   - `archived` 全部排在每类末尾
   - 折叠分类默认不渲染
   - 第 1 名走 `.redaiRankTop`，2–10 走 `.redaiRankRow`
4. `data/plugins.json` 是生成物：文件头不可手改，`--offline` 校验必须能在 CI 无网络下跑
5. 版本 → `0.9.0`；README 的插件榜一节重写（说明来源、排序依据、更新频率、如何提 PR）
6. `docs/review/tools/render.mjs` 的插件页夹具需要跟着改，否则 QA 的像素工具会失效

## 5. 验收

```bash
node scripts/build-ranking.mjs --offline     # 结构与排序自洽
node scripts/build-ranking.mjs               # 真实抓取（约 7 分钟），打印每类命中/死链
node scripts/build.mjs && node --check lib/client.js && node test/smoke.mjs
node scripts/build.mjs --check
```

另需 QA 用 Edge 截图确认：默认视图能一眼看出是「榜」而不是列表；第一名与 2–10 名层级分明；折叠分类不出现；`更多` 展开后 11 类齐全。
