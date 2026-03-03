

# 产品需求文档 (PRD) - 俄语精读在线笔记系统 (MVP v1.2)

------

## 一、产品定位

### 1. 产品一句话

一个将“精读 → 划线（带上下文感知） → 总结 → 卡片沉淀”完整线上化的俄语学习笔记系统。

AI 负责结合上下文生成结构化学习报告与卡片初稿，用户拥有最终编辑权。

------

### 2. 核心价值

- 降低精读启动成本
- 提供基于上下文的即时翻译与发音辅助
- 自动生成文章级结构化学习总结
- 自动沉淀为结构化卡片（支持导出至 Anki）
- 支持知识库管理与导出

------

## 二、目标用户

核心用户：

- 俄语专业学生
- 具备基础阅读能力（A2–B2）的学习者

用户特征：

- 有精读与做笔记习惯
- 需要积累表达与用法（尤其是变格变位与动词体）

不面向：

- 零基础学习者
- 旅游俄语用户
- 轻娱乐型学习场景

------

## 三、核心流程

1. 导入文本（粘贴或上传）
2. 后台生成全文翻译（默认不展示）
3. 阅读并划线（即时弹出上下文翻译与发音）
4. 点击「完成本篇精读」
5. 确认是否生成总结
6. 流式生成总结页（学习提要 + 卡片）
7. 卡片沉淀进入知识库

------

## 四、功能模块

------

### 模块 1：阅读页 (Reader)

#### 功能

- 文本导入
- 划线高亮
- 即时翻译气泡（含发音）
- 多次划线
- “完成本篇精读”按钮

#### 规则

- 单次划线 ≤ 100 字符
- 不即时生成卡片
- 不弹出分类选择
- 划线数据保存为 Highlight 记录

#### 重叠规则（修正版）

- 若新划线与旧划线重叠 → 自动合并区间
- 不允许覆盖旧划线

#### 数据保存要求

每条 Highlight 必须包含：

- 划线内容
- 划线在原文中的字符区间 `{ start, end }`
- 所在完整原句（contextSentence）
- 即时翻译（仅用于阅读阶段）

------

### 模块 2：完成确认页 (Confirmation)

- 展示本篇划线数量
- 用户可选择：
  - 开始生成总结
  - 返回继续阅读

生成过程中展示 Loading 状态。

------

### 模块 3：总结页 (Summary)

采用 **SSE 流式输出**。

#### 包含内容：

### A. 学习提要

结构：

```json
{
  "learningPoints": ["point1", "point2", "..."]
}
```

- 5–8 条
- 每条不超过 2 行
- 禁止长段解释

------

### B. 全文翻译

- 默认折叠
- 可展开

------

### C. 本篇卡片区

根据所有 Highlight 自动生成 Card。

------

### 模块 4：卡片结构 (Card)

每条划线生成 1 张卡片。

字段：

- originalText
- lemma（若动词需尽量给出体配对）
- translation（精准释义）
- usageNote（1 行用法）
- contextSentence（原句）
- contextSentenceTranslation（原句翻译）
- note（用户备注）
- priority（normal / high）

规则：

- 禁止长段语法讲解
- 所有字段可编辑
- 不允许新增字段

------

### 模块 5：知识库页 (Library)

双视图：

#### 1. 按文章

- 查看历史文章
- 删除文章（级联删除相关数据）

#### 2. 按卡片

- 全局卡片列表
- 搜索（多字段）
- 重点置顶
- 抽屉编辑

------

### 模块 6：导出 (Export)

#### A. PDF

- 包含学习提要
- 全文翻译
- 所有卡片

#### B. CSV (Anki)

字段映射：

正面：

- originalText + lemma

背面：

- translation + usageNote + contextSentence

------

## 五、关键约束

- 划线翻译响应 < 2 秒
- 总结首字响应 < 2 秒
- 搜索响应 < 1 秒
- AI 输出必须 JSON 结构化
- 文章在生成总结后锁定，不可编辑原文（防止高亮错位）

------

# API 设计与数据结构 (API Design & Schema) - v1.2

------

## 一、数据库模型

------

### Article

```ts
id: UUID
title: string
content: text
fullTranslation: text
summary: JSON  // { learningPoints: string[] }
status: "draft" | "completed"
createdAt: timestamp
updatedAt: timestamp
```

------

### Highlight

```ts
id: UUID
articleId: UUID
textRange: {
  start: number
  end: number
}
originalText: string
contextSentence: text
translation: string   // 仅用于阅读阶段
createdAt: timestamp
```

------

### Card

```ts
id: UUID
articleId: UUID
highlightId: UUID
originalText: string
lemma: string
translation: string
usageNote: text
contextSentence: text
contextSentenceTranslation: text
note: text
priority: "normal" | "high"
createdAt: timestamp
```

------

## 二、RESTful API

------

### Articles

```http
GET    /api/articles?page=1&limit=20
GET    /api/articles/:id
POST   /api/articles
PUT    /api/articles/:id
DELETE /api/articles/:id
```

GET `/api/articles/:id` 返回：

```json
{
  "article": {},
  "highlights": [],
  "cards": []
}
```

------

### Highlights

```http
GET    /api/articles/:articleId/highlights
POST   /api/highlights
PUT    /api/highlights/:id
DELETE /api/highlights/:id
```

------

### Cards

```http
GET    /api/cards?page=1&limit=50&search=xxx&priority=high
GET    /api/articles/:articleId/cards
POST   /api/articles/:id/generate-cards
PUT    /api/cards/:id
DELETE /api/cards/:id
```

------

### Streaming 总结生成

```http
POST /api/articles/:id/generate-summary
Content-Type: application/json
Response: text/event-stream
```

返回 SSE 数据：

```
event: summary
data: { learningPoints: [...] }

event: card
data: { ...cardJson }

event: done
```

------

### 导出

```http
GET /api/export/pdf?scope=article&id=xxx
GET /api/export/pdf?scope=all
GET /api/export/csv?scope=article&id=xxx
GET /api/export/csv?scope=all
```

------

## 三、前端对接注意事项

- 使用 SSE 接收流式数据
- 所有写操作必须 await API 成功后再更新本地状态
- 增加统一错误提示机制
- 禁止前端自行拼接 AI 输出
