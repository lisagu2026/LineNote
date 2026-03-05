const DEEPSEEK_API_URL = `${process.env.DEEPSEEK_API_BASE_URL ?? 'https://api.deepseek.com'}/chat/completions`;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

function buildPrompt({title, content, highlights}) {
  const cards = highlights.map((item, index) => ({
    index,
    originalText: item.originalText,
    currentLemma: item.lemma ?? '',
    currentTranslationZh: item.translationZh ?? '',
    currentUsageNote: item.usageNote ?? '',
    currentExample: item.example ?? '',
    currentNote: item.note ?? '',
  }));

  return [
    '请分析下面这篇俄语文章，并严格返回 JSON 对象。',
    '只允许输出一个 JSON 对象，禁止 Markdown，禁止解释，禁止额外字段。',
    'JSON 结构必须是：',
    '{"learningPoints":["..."],"fullTranslationZh":"...","cards":[{"originalText":"...","lemma":"...","translationZh":"...","usageNote":"...","example":"...","note":"...","isImportant":true}]}',
    '约束：',
    '1. learningPoints 返回 5 到 8 条，每条不超过 80 个中文字符。',
    '2. fullTranslationZh 必须是整篇文章的自然中文翻译。',
    '3. cards 数量必须与输入 highlights 完全一致，顺序也必须一致。',
    '4. cards 里的 originalText 必须与输入中的 originalText 完全一致。',
    '5. usageNote 必须简短，控制在一行内。',
    '6. example 如果无必要可为空字符串，note 可以为空字符串。',
    '7. isImportant 根据学习价值判断 true 或 false。',
    '',
    `文章标题：${title}`,
    `文章内容：${content}`,
    `待分析高亮：${JSON.stringify(cards)}`,
  ].join('\n');
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validateAnalysisPayload(payload, highlights) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('DeepSeek response is not a JSON object');
  }

  const learningPoints = Array.isArray(payload.learningPoints) ? payload.learningPoints : null;
  if (!learningPoints || learningPoints.length < 1) {
    throw new Error('Missing learningPoints');
  }

  const fullTranslationZh = normalizeString(payload.fullTranslationZh);
  if (!fullTranslationZh) {
    throw new Error('Missing fullTranslationZh');
  }

  const cards = Array.isArray(payload.cards) ? payload.cards : null;
  if (!cards || cards.length !== highlights.length) {
    throw new Error('cards length does not match highlights');
  }

  return {
    learningPoints: learningPoints.map((point) => normalizeString(point)).filter(Boolean).slice(0, 8),
    fullTranslationZh,
    cards: cards.map((card, index) => {
      const originalText = normalizeString(card?.originalText, highlights[index].originalText);
      if (originalText !== highlights[index].originalText) {
        throw new Error('cards originalText order mismatch');
      }

      return {
        originalText,
        lemma: normalizeString(card?.lemma),
        translationZh: normalizeString(card?.translationZh),
        usageNote: normalizeString(card?.usageNote),
        example: normalizeString(card?.example),
        note: normalizeString(card?.note),
        isImportant: Boolean(card?.isImportant ?? highlights[index].isImportant),
      };
    }),
  };
}

async function requestAnalysis(messages, options = {}) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: options.maxTokens,
      response_format: {type: 'json_object'},
      messages,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.error || `DeepSeek request failed with status ${response.status}`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek returned empty content');
  }

  return JSON.parse(content);
}

export async function analyzeArticleWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const messages = [
    {
      role: 'system',
      content:
        '你是一个俄语语言分析工具。你只输出严格 JSON，不解释，不使用 Markdown，不输出多余文字。输出必须完全符合用户指定结构。',
    },
    {
      role: 'user',
      content: buildPrompt(input),
    },
  ];

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await requestAnalysis(messages);
      return validateAnalysisPayload(payload, input.highlights);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('DeepSeek analysis failed');
}

function validateTranslatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('DeepSeek response is not a JSON object');
  }

  const translation = normalizeString(payload.translationZh || payload.translation);
  if (!translation) {
    throw new Error('Missing translation');
  }

  return {
    translationZh: translation,
    lemma: normalizeString(payload.lemma),
    usageNote: normalizeString(payload.usageNote),
    example: normalizeString(payload.example),
    note: normalizeString(payload.note),
  };
}

export async function translateHighlightWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const messages = [
    {
      role: 'system',
      content:
        '你是一个俄语语言分析工具。你只输出严格 JSON，不解释，不使用 Markdown，不输出多余文字。输出字段必须是 translationZh、lemma、usageNote、example、note。',
    },
    {
      role: 'user',
      content: [
        '返回一个 JSON 对象，字段只能是 translationZh, lemma, usageNote, example, note。',
        '禁止 Markdown，禁止解释，禁止额外字段。',
        'translationZh 必须结合上下文；usageNote 一句话；其余字段可为空字符串。',
        '',
        `originalText: ${input.originalText}`,
        `contextSentence: ${input.contextSentence || ''}`,
        `articleContext: ${input.articleContext || ''}`,
      ].join('\n'),
    },
  ];

  const payload = await requestAnalysis(messages, {maxTokens: 220});
  return validateTranslatePayload(payload);
}
