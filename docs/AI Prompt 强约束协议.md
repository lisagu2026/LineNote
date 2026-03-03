# AI Prompt 强约束协议

适用于：

- 即时翻译（Highlight 阶段）
- 总结生成（Summary 阶段）
- 卡片生成（Card 阶段）

------

# 一、全局输出规则（所有 AI 接口通用）

## 1️⃣ 必须输出 JSON

- 禁止输出 Markdown
- 禁止输出解释性文字
- 禁止输出前言/后记
- 禁止输出代码块标记
- 不允许额外字段

## 2️⃣ 不允许自由发挥

- 不得生成教学性段落
- 不得写“以下是……”
- 不得使用 emoji
- 不得扩展用户未标注内容

## 3️⃣ 长度限制

- 单字段最大 200 字
- usageNote 必须 ≤ 1 行
- learningPoints 每条 ≤ 2 行

------

# 二、即时翻译接口 Prompt 规范

## 输入

```json
{
  "originalText": "...",
  "contextSentence": "...",
  "articleContext": "可选：前后句"
}
```

## 输出格式

```json
{
  "translation": "中文翻译",
  "lemma": "原型（若适用）",
  "pronunciation": "IPA或音标（可选）"
}
```

### 约束

- translation 必须结合上下文
- 若 originalText 为动词：
  - lemma 尽量提供 体配对（如 делать / сделать）
- 不得解释语法
- 不得举例

------

# 三、总结生成接口 Prompt 规范（SSE 流式）

## 输入

```json
{
  "articleContent": "...",
  "highlights": [
    {
      "originalText": "...",
      "contextSentence": "..."
    }
  ]
}
```

------

## 流式输出规则

必须按顺序输出：

------

### 1️⃣ 学习提要

```json
{
  "type": "summary",
  "learningPoints": [
    "point1",
    "point2",
    "point3"
  ]
}
```

规则：

- 5–8 条
- 每条 ≤ 2 行
- 只总结语言点
- 不评价文章内容

------

### 2️⃣ 每张卡片

逐张输出：

```json
{
  "type": "card",
  "data": {
    "originalText": "...",
    "lemma": "...",
    "translation": "...",
    "usageNote": "...",
    "contextSentence": "...",
    "contextSentenceTranslation": "...",
    "priority": "normal"
  }
}
```

规则：

- usageNote ≤ 1 行
- 不得生成多余字段
- contextSentence 必须与输入一致
- contextSentenceTranslation 必须对应原句

------

### 3️⃣ 结束信号

```json
{
  "type": "done"
}
```

------

# 四、严格错误防护机制

后端必须：

1. 校验 JSON 格式
2. 校验字段完整性
3. 校验字段长度
4. 校验 type 是否合法
5. 若失败 → 自动重试一次
6. 仍失败 → 返回错误给前端

------

# 五、温度与模型参数建议

用于 DeepSeek / 其他模型：

- temperature: 0.2
- top_p: 0.8
- max_tokens: 合理控制
- 强制 JSON 模式（如支持）

------

# 六、防跑偏示例（必须加入 system prompt）

System Prompt 示例核心段落：

> 你是一个俄语语言分析工具，只输出严格 JSON。
> 你不是教师，不做解释。
> 你不生成段落。
> 你不使用 Markdown。
> 你不输出多余文字。
> 输出必须完全符合指定 JSON 结构，否则视为错误。

------

# 七、为什么必须这样强约束？

因为如果不强约束：

- AI 会写一大段解释
- 会加“以下是……”
- 会给例外情况说明
- 会用 Markdown
- 会变成教学文章

然后：

- SSE 解析失败
- 前端渲染报错
- 卡片字段错位

------

# 八、强约束的工程优势

- 可预测
- 可校验
- 可重试
- 不依赖“模型听话”

