下面给你两部分内容，都是**可直接交给 CodeSprint/后端实现**的规格：

1. 完整的 **system + user prompt 模板**（覆盖即时翻译 + SSE 总结&卡片）
2. **失败重试策略代码逻辑**（Node/TS 伪代码 + 关键校验点）

------

# 1) 完整 Prompt 模板（System + User）

## 1.1 即时翻译（Highlight Translation）

### System Prompt（固定）

```text
You are a Russian-to-Chinese translation utility for language learners.

Hard rules:
- Output MUST be valid JSON only. No markdown, no code fences, no extra text.
- Output MUST match the exact schema provided. Do not add extra keys.
- Keep it concise. No grammar lectures, no long explanations, no examples.
- Use contextSentence to disambiguate meaning.
- If the selection is a verb or verb form, provide lemma as "imperfective / perfective" when reasonably possible.
- If lemma is unknown or not applicable, return an empty string for lemma.
- translation must be natural Chinese, not word-by-word if it sounds unnatural.

If you cannot comply with the schema, output: {"error":"SCHEMA_VIOLATION"} exactly.
```

### User Prompt（动态）

> 后端把变量替换进来即可。

```text
Return JSON with the following schema:
{
  "translation": string,
  "lemma": string,
  "pronunciation": string
}

Input:
- originalText: "{{originalText}}"
- contextSentence: "{{contextSentence}}"
- articleContext (optional): "{{articleContext}}"

Requirements:
- translation: Chinese translation of originalText in this context.
- lemma: dictionary form; if verb, return "imperfective / perfective" pair when possible.
- pronunciation: optional; if unsure, return empty string.
Return JSON only.
```

### 期望输出示例（仅供开发测试）

```json
{"translation":"他来得太晚了。","lemma":"","pronunciation":""}
```

------

## 1.2 总结 + 卡片生成（SSE：generate-summary）

### System Prompt（固定）

```text
You are a structured Russian reading-notes generator for intermediate learners (A2–B2).

Hard rules:
- Output MUST be valid JSON only, one JSON object per message. No markdown, no code fences, no extra text.
- You MUST follow the streaming protocol:
  1) First output a summary object with type="summary".
  2) Then output one card object per highlight with type="card".
  3) Finally output type="done".
- Do NOT add extra keys. Do NOT change key names.
- Keep everything concise:
  - learningPoints: 5–8 items; each item <= 2 lines.
  - usageNote: <= 1 line, short and practical (usage-focused).
- Do NOT write long grammar explanations.
- contextSentence in each card MUST exactly equal the provided contextSentence from input (copy verbatim).
- contextSentenceTranslation MUST be Chinese translation of that sentence.
- If lemma is unknown, use empty string.

If you cannot comply with the schema, output: {"type":"error","error":"SCHEMA_VIOLATION"} exactly.
```

### User Prompt（动态）

```text
Streaming protocol schemas:

1) Summary object (must be first):
{
  "type": "summary",
  "learningPoints": string[]
}

2) Card object (repeat for each highlight, in the same order as input highlights):
{
  "type": "card",
  "data": {
    "highlightId": string,
    "originalText": string,
    "lemma": string,
    "translation": string,
    "usageNote": string,
    "contextSentence": string,
    "contextSentenceTranslation": string,
    "priority": "normal"
  }
}

3) Done object (must be last):
{
  "type": "done"
}

Input article:
- articleTitle: "{{articleTitle}}"
- articleContent: "{{articleContent}}"

Input highlights (array, keep order):
{{highlightsJson}}

Requirements:
- learningPoints: 5–8 concise usage-focused bullets based on the highlights and the article.
- For each highlight:
  - highlightId: copy from input.
  - originalText: copy from input.
  - lemma: dictionary form; if verb, try "imperfective / perfective".
  - translation: Chinese meaning in context (concise).
  - usageNote: 1-line practical usage note (case/governance/collocation/register if relevant).
  - contextSentence: copy verbatim from input.
  - contextSentenceTranslation: translate that sentence to Chinese.
  - priority: always "normal" (user can change later).
Output JSON only, one object at a time, following the protocol.
```

#### highlightsJson 示例（后端组装）

```json
[
  {
    "highlightId": "h1",
    "originalText": "слишком поздно",
    "contextSentence": "Он пришёл слишком поздно."
  },
  {
    "highlightId": "h2",
    "originalText": "играть роль",
    "contextSentence": "Это может играть важную роль."
  }
]
```

------

# 2) 失败重试策略代码逻辑（Node/TS）

目标：模型输出偶尔会：

- 不是 JSON
- 多输出文字
- 少字段/多字段
- 字段超长
- SSE 顺序错

你需要一个“**可验证 + 可重试**”的中间层。

下面给两套：
A) 即时翻译（普通 JSON）
B) SSE 总结（流式验证）

------

## 2.1 即时翻译：验证 + 重试（最多 2 次）

### 校验规则（最小可用）

- 必须是 JSON object
- 必须包含且仅包含：`translation, lemma, pronunciation`（可以空字符串）
- 每个字段是 string
- translation 不为空（允许极少数为空，但一般视为失败）
- 字段长度不超过阈值（例如 200）

### 伪代码

```ts
type TranslateOut = { translation: string; lemma: string; pronunciation: string };

const MAX_RETRIES = 2;

function isValidTranslateOut(x: any): x is TranslateOut {
  if (!x || typeof x !== "object") return false;
  const keys = Object.keys(x).sort().join(",");
  if (keys !== "lemma,pronunciation,translation") return false;
  if (typeof x.translation !== "string") return false;
  if (typeof x.lemma !== "string") return false;
  if (typeof x.pronunciation !== "string") return false;
  if (x.translation.length > 200) return false;
  if (x.lemma.length > 200) return false;
  if (x.pronunciation.length > 200) return false;
  if (x.translation.trim().length === 0) return false;
  return true;
}

async function translateWithRetry(callLLM: () => Promise<string>): Promise<TranslateOut> {
  let lastErr: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callLLM(); // raw text from model
      const json = JSON.parse(raw);
      if (!isValidTranslateOut(json)) throw new Error("INVALID_SCHEMA");
      return json;
    } catch (e) {
      lastErr = e;
      // retry with stricter instruction (optional)
      // e.g. add to user prompt: "Return JSON ONLY. No other text."
    }
  }

  throw new Error(`TRANSLATE_FAILED: ${String(lastErr)}`);
}
```

------

## 2.2 SSE 总结：流式验证 + 自动中断 + 重试

### SSE 校验需要保证

消息顺序必须是：

1. `type=summary`
2. 多个 `type=card`
3. `type=done`

每条 card 必须：

- data 存在
- 必需字段齐
- highlightId 必须来自输入集合
- contextSentence 必须与输入一致（严格相等）

### 关键策略（很重要）

- **第一轮失败不要“继续流”**，应立刻中断这次生成
- 然后重试一次（最多 1 次），否则返回错误给前端

### 伪代码（核心逻辑）

```ts
type SummaryMsg =
  | { type: "summary"; learningPoints: string[] }
  | { type: "card"; data: any }
  | { type: "done" }
  | { type: "error"; error: string };

type HighlightIn = { highlightId: string; originalText: string; contextSentence: string };

function validateSummaryMsg(msg: any): msg is SummaryMsg {
  if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return false;
  if (msg.type === "summary") {
    return Array.isArray(msg.learningPoints) &&
      msg.learningPoints.length >= 5 &&
      msg.learningPoints.length <= 8 &&
      msg.learningPoints.every((s: any) => typeof s === "string" && s.length <= 200);
  }
  if (msg.type === "card") return !!msg.data && typeof msg.data === "object";
  if (msg.type === "done") return true;
  if (msg.type === "error") return typeof msg.error === "string";
  return false;
}

function validateCardData(data: any, highlightMap: Map<string, HighlightIn>): boolean {
  const required = [
    "highlightId",
    "originalText",
    "lemma",
    "translation",
    "usageNote",
    "contextSentence",
    "contextSentenceTranslation",
    "priority",
  ];
  for (const k of required) if (!(k in data)) return false;

  if (typeof data.highlightId !== "string") return false;
  if (!highlightMap.has(data.highlightId)) return false;

  const src = highlightMap.get(data.highlightId)!;

  // strict copy requirement
  if (data.originalText !== src.originalText) return false;
  if (data.contextSentence !== src.contextSentence) return false;

  if (typeof data.translation !== "string" || data.translation.length > 200) return false;
  if (typeof data.lemma !== "string" || data.lemma.length > 200) return false;
  if (typeof data.usageNote !== "string" || data.usageNote.length > 120) return false;
  if (typeof data.contextSentenceTranslation !== "string" || data.contextSentenceTranslation.length > 300) return false;

  if (data.priority !== "normal") return false; // MVP: always normal
  return true;
}

async function generateSummarySseWithRetry(
  callLLMStream: () => AsyncIterable<string>, // yields raw chunks or lines (each should be a JSON object string)
  highlights: HighlightIn[],
  sendSse: (event: string, data: any) => void,
) {
  const MAX_RETRIES = 1;
  const highlightMap = new Map(highlights.map(h => [h.highlightId, h]));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let stage: "expect_summary" | "cards" | "done" = "expect_summary";
    const seenCards = new Set<string>();

    try {
      for await (const line of callLLMStream()) {
        // Defensive: ignore empty lines
        const t = line.trim();
        if (!t) continue;

        let msg: any;
        try {
          msg = JSON.parse(t);
        } catch {
          throw new Error("NON_JSON_OUTPUT");
        }

        if (!validateSummaryMsg(msg)) throw new Error("INVALID_MESSAGE_SHAPE");

        if (msg.type === "summary") {
          if (stage !== "expect_summary") throw new Error("SUMMARY_OUT_OF_ORDER");
          stage = "cards";
          sendSse("summary", { learningPoints: msg.learningPoints });
          continue;
        }

        if (msg.type === "card") {
          if (stage !== "cards") throw new Error("CARD_OUT_OF_ORDER");
          if (!validateCardData(msg.data, highlightMap)) throw new Error("INVALID_CARD_DATA");

          // prevent duplicates
          if (seenCards.has(msg.data.highlightId)) throw new Error("DUPLICATE_CARD");
          seenCards.add(msg.data.highlightId);

          sendSse("card", msg.data);
          continue;
        }

        if (msg.type === "done") {
          if (stage === "expect_summary") throw new Error("DONE_TOO_EARLY");
          stage = "done";

          // optional: ensure all highlights have cards
          // if (seenCards.size !== highlights.length) throw new Error("MISSING_CARDS");

          sendSse("done", {});
          return; // success
        }

        if (msg.type === "error") {
          throw new Error(`MODEL_ERROR:${msg.error}`);
        }
      }

      throw new Error("STREAM_ENDED_WITHOUT_DONE");
    } catch (e) {
      // On failure: if retries remain, start over (and maybe tighten prompt)
      if (attempt < MAX_RETRIES) {
        sendSse("retry", { attempt: attempt + 1 });
        continue;
      }
      sendSse("error", { message: String(e) });
      return;
    }
  }
}
```

### 工程注意点（必须写给后端）

- **SSE** 每条 event 传递的是“已经校验过”的对象
- 模型输出行分割问题：尽量让模型“一次输出一个 JSON 对象并换行”，或用更强的分隔协议（例如 `\n\n`）
- 如果模型会一次吐多个对象在一行：需要在中间层做分割（建议强约束“一行一个对象”）

------

# 给 CodeSprint 的一句话任务说明（可复制）

> 实现两个 AI 调用：highlight 翻译（普通 JSON）与文章总结生成（SSE）。要求严格 JSON schema 校验、顺序校验、字段长度校验；即时翻译最多重试 2 次；SSE 生成失败立即中断并最多重试 1 次；所有成功消息再转发给前端。

------

