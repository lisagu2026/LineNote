const DEEPSEEK_API_URL = `${process.env.DEEPSEEK_API_BASE_URL ?? 'https://api.deepseek.com'}/chat/completions`;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?。！？\n])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function chunkTextBySentences(content, maxChars = 1400) {
  const sentences = splitSentences(content);
  if (sentences.length === 0) {
    return [];
  }

  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    if ((current.length + sentence.length + 1) <= maxChars) {
      current += ` ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function toSummaryHighlightFocus(highlights) {
  if (!Array.isArray(highlights)) {
    return [];
  }

  return highlights
    .map((item, index) => ({
      index,
      originalText: normalizeString(item?.originalText),
      isImportant: Boolean(item?.isImportant),
      translationZh: normalizeString(item?.translationZh),
      lemma: normalizeString(item?.lemma),
      usageNote: normalizeString(item?.usageNote),
    }))
    .filter((item) => item.originalText)
    .slice(0, 30);
}

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
    '角色设定：你是一位拥有10年经验的资深俄语导师，擅长化繁为简。',
    '请分析下面这篇俄语文章，并严格返回 JSON 对象。',
    '只允许输出一个 JSON 对象，禁止 Markdown，禁止解释，禁止额外字段。',
    'JSON 结构必须是：',
    '{"learningPoints":["..."],"fullTranslationZh":"...","cards":[{"originalText":"...","lemma":"...","translationZh":"...","usageNote":"...","example":"...","note":"...","isImportant":true}]}',
    '约束：',
    '1. learningPoints 返回 6 到 10 条，尽量详细、具有学习步骤感。',
    '2. 总结应以语言学习价值为主，优先覆盖词汇、语法、表达，也可以加入内容梗概、句法拆解、搭配观察等角度。',
    '3. 如果你使用模块前缀，可选用 [词汇]/[语法]/[表达]/[内容]；不强制每条都带前缀。',
    '4. 若未提供有效划线词，请先从原文自动挑选 3 到 5 个核心词再做学习总结。',
    '5. fullTranslationZh 必须是整篇文章的自然中文翻译。',
    '6. cards 数量必须与输入 highlights 完全一致，顺序也必须一致。',
    '7. cards 里的 originalText 必须与输入中的 originalText 完全一致。',
    '8. usageNote 必须简短，控制在一行内。',
    '9. example 如果无必要可为空字符串，note 可以为空字符串。',
    '10. isImportant 根据学习价值判断 true 或 false。',
    '',
    `文章标题：${title}`,
    `文章内容：${content}`,
    `待分析高亮：${JSON.stringify(cards)}`,
  ].join('\n');
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validateLearningPointsRaw(input) {
  if (!Array.isArray(input)) {
    throw new Error('Missing learningPoints');
  }

  const cleaned = input.map((item) => normalizeString(item)).filter(Boolean);
  if (cleaned.length < 5 || cleaned.length > 14) {
    throw new Error('learningPoints must contain 5-14 items');
  }

  return cleaned;
}

function categorizeLearningPoint(point) {
  if (point.startsWith('[词汇]')) return 'vocab';
  if (point.startsWith('[语法]')) return 'grammar';
  if (point.startsWith('[表达]')) return 'expression';
  if (point.startsWith('[内容]')) return 'content';
  return 'unknown';
}

function validateLearningPointCategories(points) {
  const buckets = {
    vocab: 0,
    grammar: 0,
    expression: 0,
    content: 0,
    unknown: 0,
  };

  for (const point of points) {
    buckets[categorizeLearningPoint(point)] += 1;
  }

  const categorizedCount = buckets.vocab + buckets.grammar + buckets.expression + buckets.content;
  if (categorizedCount > 0 && categorizedCount < Math.min(3, points.length)) {
    throw new Error('learningPoints categorized coverage is too low');
  }
}

function validateAnalysisPayload(payload, highlights) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('DeepSeek response is not a JSON object');
  }

  const learningPoints = validateLearningPointsRaw(payload.learningPoints);
  validateLearningPointCategories(learningPoints);

  const fullTranslationZh = normalizeString(payload.fullTranslationZh);
  if (!fullTranslationZh) {
    throw new Error('Missing fullTranslationZh');
  }

  const cards = Array.isArray(payload.cards) ? payload.cards : null;
  if (!cards || cards.length !== highlights.length) {
    throw new Error('cards length does not match highlights');
  }

  return {
    learningPoints,
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

function validateSummaryPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('DeepSeek response is not a JSON object');
  }

  const rawPoints = Array.isArray(payload.learningPoints) ? payload.learningPoints : null;
  if (!rawPoints) {
    throw new Error('Missing learningPoints');
  }

  const normalizedPoints = rawPoints.map((item) => {
    if (typeof item === 'string') {
      return {point: normalizeString(item), evidence: []};
    }
    const point = normalizeString(item?.point ?? item?.text ?? '');
    const evidence = Array.isArray(item?.evidence)
      ? item.evidence.map((snippet) => normalizeString(snippet)).filter(Boolean).slice(0, 3)
      : [];
    return {point, evidence};
  });

  const learningPoints = validateLearningPointsRaw(normalizedPoints.map((item) => item.point));
  validateLearningPointCategories(learningPoints);

  const fullTranslationZh = normalizeString(payload.fullTranslationZh);
  if (!fullTranslationZh) {
    throw new Error('Missing fullTranslationZh');
  }

  const learningPointEvidences = learningPoints.map((point, index) => ({
    point,
    sourceSnippets: normalizedPoints[index]?.evidence ?? [],
  }));

  return {
    learningPoints,
    fullTranslationZh,
    learningPointEvidences,
  };
}

async function requestAnalysis(messages, options = {}) {
  const temperature = typeof options.temperature === 'number' ? options.temperature : 0.2;
  const topP = typeof options.topP === 'number' ? options.topP : 0.8;
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature,
      top_p: topP,
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

function validateChunkSummaryPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('DeepSeek chunk response is not a JSON object');
  }

  const chunkTranslationZh = normalizeString(payload.chunkTranslationZh || payload.translationZh);
  if (!chunkTranslationZh) {
    throw new Error('Missing chunkTranslationZh');
  }

  const rawPoints = Array.isArray(payload.points) ? payload.points : [];
  const points = rawPoints
    .map((item) => ({
      point: normalizeString(item?.point),
      evidence: Array.isArray(item?.evidence)
        ? item.evidence.map((snippet) => normalizeString(snippet)).filter(Boolean).slice(0, 2)
        : [],
    }))
    .filter((item) => item.point);

  if (points.length < 1) {
    throw new Error('Missing chunk points');
  }

  return {
    chunkTranslationZh,
    points: points.slice(0, 5),
  };
}

async function summarizeChunkWithDeepSeek(chunk, index, totalChunks, options = {}) {
  const messages = [
    {
      role: 'system',
      content:
        '你是一个俄语阅读总结工具。你只输出严格 JSON，不解释，不使用 Markdown，不输出多余文字。',
    },
    {
      role: 'user',
      content: [
        '请基于下面文章分块，输出 JSON：',
        '{"chunkTranslationZh":"...","points":[{"point":"...","evidence":["..."]}]}',
        '约束：',
        '1. points 返回 3 到 5 条。',
        '2. point 必须是语言学习点，不得写新闻事实复述。',
        '3. point 用中文，允许写成 1-2 句；可选使用 [词汇]/[语法]/[表达] 前缀，但不是强制。',
        '4. evidence 是支持该 point 的原文短句数组（1-2条）。',
        `当前分块：${index + 1}/${totalChunks}`,
        `分块内容：${chunk}`,
      ].join('\n'),
    },
  ];

  const payload = await requestAnalysis(messages, {
    maxTokens: 1200,
    temperature: options.regenerate ? 0.55 : 0.2,
    topP: options.regenerate ? 0.9 : 0.8,
  });
  return validateChunkSummaryPayload(payload);
}

export async function summarizeArticleWithDeepSeek(input, options = {}) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const chunks = chunkTextBySentences(input.content, 1400);
  if (chunks.length === 0) {
    throw new Error('Article content is empty');
  }

  options.onProgress?.({
    stage: 'chunking',
    totalChunks: chunks.length,
    doneChunks: 0,
  });

  const chunkSummaries = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    options.onProgress?.({
      stage: 'chunk_summarizing',
      totalChunks: chunks.length,
      doneChunks: index,
      currentChunk: index + 1,
    });

    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const summary = await summarizeChunkWithDeepSeek(chunk, index, chunks.length, {
          regenerate: Boolean(input.regenerate),
        });
        chunkSummaries.push(summary);
        options.onProgress?.({
          stage: 'chunk_done',
          totalChunks: chunks.length,
          doneChunks: index + 1,
          currentChunk: index + 1,
          previewPoints: summary.points.map((item) => item.point).slice(0, 3),
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError instanceof Error ? lastError : new Error('Chunk summarize failed');
    }
  }

  options.onProgress?.({
    stage: 'synthesizing',
    totalChunks: chunks.length,
    doneChunks: chunks.length,
  });

  const highlightFocus = toSummaryHighlightFocus(input.highlights);
  const previousLearningPoints = Array.isArray(input.previousLearningPoints)
    ? input.previousLearningPoints.map((item) => normalizeString(item)).filter(Boolean).slice(0, 8)
    : [];
  const regenerateRequestId = normalizeString(input.regenerateRequestId);

  const messages = [
    {
      role: 'system',
      content:
        '你是一位拥有10年经验的资深俄语导师。你只输出严格 JSON，不解释，不使用 Markdown，不输出多余文字。',
    },
    {
      role: 'user',
      content: [
        '角色设定：你是一位拥有10年经验的资深俄语导师，擅长化繁为简。',
        '请输出 JSON：',
        '{"learningPoints":[{"point":"...","evidence":["..."]}],"fullTranslationZh":"..."}',
        '约束：',
        '1. learningPoints 返回 6 到 10 条。',
        '2. 总结以语言学习价值为主，优先覆盖词汇、语法、表达，也可以加入内容梗概、句法拆解、固定搭配、语感提醒等其他角度。',
        '3. 每条 point 必须是可操作学习建议，不得只复述文章事实。',
        '4. 每条 point 建议写成 1-2 句，给用户可直接练习的提示。',
        '5. 每条 evidence 给出 1-3 条对应原文短句。',
        '6. 若你使用模块前缀，可选用 [词汇]/[语法]/[表达]/[内容]，但不是强制。',
        '7. 如果有内容梗概，建议包含中俄双语（可写 RU:... | ZH:...）。',
        '8. 必须同时基于文章整体与用户划线，优先覆盖高价值划线（isImportant=true）。',
        '9. 若用户划线为空，请先自动挑选3到5个核心词再完成总结。',
        '10. fullTranslationZh 为全文自然中文翻译。',
        previousLearningPoints.length
          ? '11. 已提供上一版 learningPoints，尽量避免语义重复，用不同学习角度重写。'
          : '',
        regenerateRequestId
          ? '12. 本次是“重新生成”，必须显著更换结构与切入角度，避免与上一版措辞相似。'
          : '',
        `文章标题：${input.title}`,
        `文章分块总结：${JSON.stringify(chunkSummaries)}`,
        `用户划线重点：${JSON.stringify(highlightFocus)}`,
        previousLearningPoints.length
          ? `上一版 learningPoints：${JSON.stringify(previousLearningPoints)}`
          : '',
        regenerateRequestId ? `重生成请求ID：${regenerateRequestId}` : '',
      ].join('\n'),
    },
  ];

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await requestAnalysis(messages, {
        maxTokens: 2600,
        temperature: input.regenerate ? 0.7 : 0.2,
        topP: input.regenerate ? 0.95 : 0.8,
      });
      return validateSummaryPayload(payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('DeepSeek summarize failed');
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
  };
}

function looksLikeSentenceTranslation(translationZh, input) {
  const normalized = normalizeString(translationZh);
  const hint = normalizeString(input.sentenceTranslationHintZh);
  const original = normalizeString(input.originalText);
  const isSingleToken = !/\s/.test(original) && original.length <= 24;

  if (hint && normalized === hint) {
    return true;
  }
  if (isSingleToken && normalized.length >= 24) {
    return true;
  }
  if (isSingleToken && /[，。！？,.!?]/.test(normalized) && normalized.length >= 12) {
    return true;
  }
  return false;
}

export async function quickTranslateWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const buildMessages = (strictMode) => [
    {
      role: 'system',
      content:
        '你是一个俄语语言分析工具。你只输出严格 JSON，不解释，不使用 Markdown，不输出多余文字。输出字段必须是 translationZh。',
    },
    {
      role: 'user',
      content: [
        '返回一个 JSON 对象，字段只能是 translationZh。',
        '禁止 Markdown，禁止解释，禁止额外字段。',
        strictMode
          ? '只翻译 originalText 这个词/短语，不得输出整句中文。'
          : 'translationZh 必须是 originalText 的中文，不是整句翻译。',
        '',
        `originalText: ${input.originalText}`,
        `contextSentence: ${input.contextSentence || ''}`,
        `sentenceTranslationHintZh: ${input.sentenceTranslationHintZh || ''}`,
      ].join('\n'),
    },
  ];

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await requestAnalysis(buildMessages(attempt === 1), {
        maxTokens: input.sentenceTranslationHintZh ? 70 : 90,
      });
      const result = validateTranslatePayload(payload);
      if (looksLikeSentenceTranslation(result.translationZh, input)) {
        throw new Error('Translate output looks like sentence-level translation');
      }
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('DeepSeek translate failed');
}

function validateEnrichmentPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('DeepSeek response is not a JSON object');
  }

  return {
    lemma: normalizeString(payload.lemma),
    usageNote: normalizeString(payload.usageNote),
    example: normalizeString(payload.example),
    note: normalizeString(payload.note),
  };
}

export async function enrichHighlightWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const messages = [
    {
      role: 'system',
      content:
        '你是一个俄语语言分析工具。你只输出严格 JSON，不解释，不使用 Markdown，不输出多余文字。字段仅允许 lemma、usageNote、example、note。',
    },
    {
      role: 'user',
      content: [
        '返回 JSON: {"lemma":"...","usageNote":"...","example":"...","note":"..."}',
        'usageNote 一句话，example/note 可为空字符串。',
        `originalText: ${input.originalText}`,
        `contextSentence: ${input.contextSentence || ''}`,
        `translationZh: ${input.translationZh || ''}`,
      ].join('\n'),
    },
  ];

  const payload = await requestAnalysis(messages, {maxTokens: 180});
  return validateEnrichmentPayload(payload);
}

export async function translateSentenceWithDeepSeek(sentence) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const messages = [
    {
      role: 'system',
      content:
        '你是一个俄语翻译工具。你只输出严格 JSON，不解释，不使用 Markdown，不输出多余文字。输出字段必须是 translationZh。',
    },
    {
      role: 'user',
      content: [
        '把下面俄语句子翻译成自然中文。',
        '返回 JSON: {"translationZh":"..."}',
        `sentence: ${sentence}`,
      ].join('\n'),
    },
  ];

  const payload = await requestAnalysis(messages, {maxTokens: 120});
  return validateTranslatePayload(payload);
}
