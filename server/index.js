import dotenv from 'dotenv';
import express from 'express';
import {createHash, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';
import {
  analyzeArticleWithDeepSeek,
  enrichHighlightWithDeepSeek,
  quickTranslateWithDeepSeek,
  summarizeArticleWithDeepSeek,
  translateSentenceWithDeepSeek,
} from './deepseek.js';
import {
  buildSummaryCacheKey,
  buildSentenceCacheKey,
  buildTranslationCacheKey,
  createSession,
  createArticle,
  createUser,
  deleteArticleById,
  deleteCardById,
  deleteSessionByTokenHash,
  dbPath,
  getArticleById,
  getCachedSummary,
  getCachedTranslation,
  getCachedSentenceTranslation,
  getSessionByTokenHash,
  getUserByEmail,
  listArticles,
  setCachedSummary,
  setCachedSentenceTranslation,
  setCachedTranslation,
  updateCardById,
  upsertArticle,
} from './db.js';

dotenv.config({path: '.env.local'});
dotenv.config();

const app = express();
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8787);
const preprocessingJobs = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash ?? '').split(':');
  if (!salt || !expectedHash) {
    return false;
  }

  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

function hashSessionToken(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex');
}

function issueSessionToken(userId) {
  const token = randomBytes(32).toString('hex');
  createSession({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function readBearerToken(req) {
  const header = String(req.header('authorization') ?? '');
  if (!header.startsWith('Bearer ')) {
    return '';
  }
  return header.slice(7).trim();
}

function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }

  const session = getSessionByTokenHash(hashSessionToken(token));
  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      deleteSessionByTokenHash(hashSessionToken(token));
    }
    res.status(401).json({error: 'Unauthorized'});
    return;
  }

  req.authUser = session.user;
  req.authToken = token;
  next();
}

function sendSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?。！？\n])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function preprocessArticleTranslations(content) {
  const sentences = splitSentences(content);
  for (const sentence of sentences) {
    const sentenceKey = buildSentenceCacheKey(sentence);
    if (!sentenceKey || getCachedSentenceTranslation(sentenceKey)) {
      continue;
    }

    try {
      const translated = await translateSentenceWithDeepSeek(sentence);
      setCachedSentenceTranslation({
        sentenceKey,
        sentenceText: sentence,
        translationZh: translated.translationZh,
      });
    } catch (error) {
      console.error('Sentence preprocess failed:', error);
    }
  }
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({limit: '1mb'}));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'linenote-api',
    databasePath: dbPath,
    timestamp: Date.now(),
  });
});

app.post('/api/auth/register', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  const displayName = String(req.body?.displayName ?? '').trim();

  if (!isValidEmail(email)) {
    res.status(400).json({error: '请输入有效邮箱'});
    return;
  }
  if (password.length < 8) {
    res.status(400).json({error: '密码至少需要 8 位'});
    return;
  }

  try {
    const user = createUser({
      email,
      displayName,
      passwordHash: hashPassword(password),
    });
    const token = issueSessionToken(user.id);
    res.status(201).json({user, token});
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({error: '该邮箱已注册'});
      return;
    }

    console.error(error);
    res.status(500).json({error: '注册失败'});
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');

  if (!isValidEmail(email) || !password) {
    res.status(400).json({error: '请输入邮箱和密码'});
    return;
  }

  try {
    const user = getUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({error: '邮箱或密码错误'});
      return;
    }

    const token = issueSessionToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({error: '登录失败'});
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({user: req.authUser});
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  deleteSessionByTokenHash(hashSessionToken(req.authToken));
  res.status(204).send();
});

app.get('/api/articles', requireAuth, (req, res) => {
  const includeCards = req.query.includeCards === '1';
  const userId = req.authUser.id;
  const items = listArticles(userId);

  if (!includeCards) {
    res.json({items});
    return;
  }

  const withCards = items.map((item) => getArticleById(item.id, userId)).filter(Boolean);
  res.json({items: withCards});
});

app.get('/api/articles/:id', requireAuth, (req, res) => {
  const article = getArticleById(req.params.id, req.authUser.id);
  if (!article) {
    res.status(404).json({error: 'Article not found'});
    return;
  }

  res.json(article);
});

app.post('/api/articles', requireAuth, (req, res) => {
  const {id, title, content} = req.body ?? {};

  if (!id || !title || !content) {
    res.status(400).json({error: 'id, title, and content are required'});
    return;
  }

  try {
    const article = createArticle(req.body, req.authUser.id);
    res.status(201).json(article);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({error: 'Article id already exists'});
      return;
    }

    console.error(error);
    res.status(500).json({error: 'Failed to save article'});
  }
});

app.put('/api/articles/:id', requireAuth, (req, res) => {
  const {title, content} = req.body ?? {};
  if (!title || !content) {
    res.status(400).json({error: 'title and content are required'});
    return;
  }

  try {
    const article = upsertArticle({
      ...req.body,
      id: req.params.id,
    }, req.authUser.id);
    res.json(article);
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Failed to upsert article'});
  }
});

app.delete('/api/articles/:id', requireAuth, (req, res) => {
  try {
    const deleted = deleteArticleById(req.params.id, req.authUser.id);
    if (!deleted) {
      res.status(404).json({error: 'Article not found'});
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Failed to delete article'});
  }
});

app.patch('/api/cards/:id', requireAuth, (req, res) => {
  try {
    const card = updateCardById(req.params.id, req.body ?? {}, req.authUser.id);
    if (!card) {
      res.status(404).json({error: 'Card not found'});
      return;
    }
    res.json(card);
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Failed to update card'});
  }
});

app.delete('/api/cards/:id', requireAuth, (req, res) => {
  try {
    const deleted = deleteCardById(req.params.id, req.authUser.id);
    if (!deleted) {
      res.status(404).json({error: 'Card not found'});
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Failed to delete card'});
  }
});

app.post('/api/articles/analyze', requireAuth, async (req, res) => {
  const {title, content, highlights, force} = req.body ?? {};

  if (!title || !content) {
    res.status(400).json({error: 'title and content are required'});
    return;
  }

  if (!Array.isArray(highlights)) {
    res.status(400).json({error: 'highlights must be an array'});
    return;
  }

  try {
    const cacheKey = buildSummaryCacheKey({
      mode: 'analyze',
      title,
      content,
      highlights,
    });
    if (!force) {
      const cached = getCachedSummary(cacheKey);
      if (cached?.payload) {
        res.json({
          ...cached.payload,
          cacheHit: true,
        });
        return;
      }
    }

    const result = await analyzeArticleWithDeepSeek({title, content, highlights});
    setCachedSummary({
      cacheKey,
      mode: 'analyze',
      payload: result,
    });
    res.json({
      ...result,
      cacheHit: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek analysis failed';
    const status = message === 'DEEPSEEK_API_KEY is not configured' ? 503 : 502;
    res.status(status).json({error: message});
  }
});

app.post('/api/articles/summarize', requireAuth, async (req, res) => {
  const {title, content, highlights, previousLearningPoints, regenerateRequestId, force} = req.body ?? {};
  if (!title || !content) {
    res.status(400).json({error: 'title and content are required'});
    return;
  }
  if (highlights != null && !Array.isArray(highlights)) {
    res.status(400).json({error: 'highlights must be an array'});
    return;
  }
  if (previousLearningPoints != null && !Array.isArray(previousLearningPoints)) {
    res.status(400).json({error: 'previousLearningPoints must be an array'});
    return;
  }

  try {
    const cacheKey = buildSummaryCacheKey({
      mode: 'summarize',
      title,
      content,
      highlights: Array.isArray(highlights) ? highlights : [],
    });
    if (!force) {
      const cached = getCachedSummary(cacheKey);
      if (cached?.payload) {
        res.json({
          ...cached.payload,
          cacheHit: true,
        });
        return;
      }
    }

    const result = await summarizeArticleWithDeepSeek({
      title,
      content,
      highlights: Array.isArray(highlights) ? highlights : [],
      previousLearningPoints: Array.isArray(previousLearningPoints) ? previousLearningPoints : [],
      regenerateRequestId,
      regenerate: Boolean(force),
    });
    setCachedSummary({
      cacheKey,
      mode: 'summarize',
      payload: result,
    });
    res.json({
      ...result,
      cacheHit: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek summarize failed';
    const status = message === 'DEEPSEEK_API_KEY is not configured' ? 503 : 502;
    res.status(status).json({error: message});
  }
});

app.post('/api/articles/summarize-stream', requireAuth, async (req, res) => {
  const {title, content, highlights, previousLearningPoints, regenerateRequestId, force} = req.body ?? {};
  if (!title || !content) {
    res.status(400).json({error: 'title and content are required'});
    return;
  }
  if (highlights != null && !Array.isArray(highlights)) {
    res.status(400).json({error: 'highlights must be an array'});
    return;
  }
  if (previousLearningPoints != null && !Array.isArray(previousLearningPoints)) {
    res.status(400).json({error: 'previousLearningPoints must be an array'});
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const cacheKey = buildSummaryCacheKey({
      mode: 'summarize',
      title,
      content,
      highlights: Array.isArray(highlights) ? highlights : [],
    });
    if (!force) {
      const cached = getCachedSummary(cacheKey);
      if (cached?.payload) {
        sendSseEvent(res, 'status', {
          stage: 'cache_hit',
          message: '命中缓存，正在返回结果',
        });
        sendSseEvent(res, 'result', {
          ...cached.payload,
          cacheHit: true,
        });
        sendSseEvent(res, 'done', {ok: true});
        res.end();
        return;
      }
    }

    sendSseEvent(res, 'status', {
      stage: 'start',
      message: '开始生成总结',
    });

    const result = await summarizeArticleWithDeepSeek(
      {
        title,
        content,
        highlights: Array.isArray(highlights) ? highlights : [],
        previousLearningPoints: Array.isArray(previousLearningPoints) ? previousLearningPoints : [],
        regenerateRequestId,
        regenerate: Boolean(force),
      },
      {
        onProgress: (progress) => {
          if (progress.stage === 'chunking') {
            sendSseEvent(res, 'status', {
              stage: progress.stage,
              message: `已切分为 ${progress.totalChunks} 个分块`,
              ...progress,
            });
            return;
          }

          if (progress.stage === 'chunk_summarizing') {
            sendSseEvent(res, 'status', {
              stage: progress.stage,
              message: `正在处理分块 ${progress.currentChunk}/${progress.totalChunks}`,
              ...progress,
            });
            return;
          }
          if (progress.stage === 'chunk_done') {
            sendSseEvent(res, 'status', {
              stage: progress.stage,
              message: `已完成分块 ${progress.currentChunk}/${progress.totalChunks}`,
              ...progress,
            });
            return;
          }

          sendSseEvent(res, 'status', {
            stage: progress.stage,
            message: '正在汇总最终结果',
            ...progress,
          });
        },
      },
    );

    setCachedSummary({
      cacheKey,
      mode: 'summarize',
      payload: result,
    });

    sendSseEvent(res, 'result', {
      ...result,
      cacheHit: false,
    });
    sendSseEvent(res, 'done', {ok: true});
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek summarize failed';
    sendSseEvent(res, 'error', {error: message});
    sendSseEvent(res, 'done', {ok: false});
    res.end();
  }
});

app.post('/api/highlights/translate', requireAuth, async (req, res) => {
  const {originalText, contextSentence, articleContext} = req.body ?? {};
  if (!originalText) {
    res.status(400).json({error: 'originalText is required'});
    return;
  }

  try {
    const cacheKey = buildTranslationCacheKey(originalText, contextSentence ?? '');
    const cached = getCachedTranslation(cacheKey);
    if (cached) {
      res.json({
        translationZh: cached.translationZh,
        lemma: '',
        usageNote: '',
        example: '',
        note: '',
        cacheHit: true,
      });
      return;
    }

    const sentenceKey = buildSentenceCacheKey(contextSentence ?? '');
    const cachedSentence = sentenceKey ? getCachedSentenceTranslation(sentenceKey) : null;

    const result = await quickTranslateWithDeepSeek({
      originalText,
      contextSentence,
      articleContext,
      sentenceTranslationHintZh: cachedSentence?.translationZh ?? '',
    });

    const saved = setCachedTranslation({
      cacheKey,
      originalText,
      contextSentence: contextSentence ?? '',
      translationZh: result.translationZh,
      lemma: '',
      usageNote: '',
      example: '',
      note: '',
    });

    res.json({
      translationZh: saved.translationZh,
      lemma: '',
      usageNote: '',
      example: '',
      note: '',
      cacheHit: false,
      fromSentenceCache: Boolean(cachedSentence?.translationZh),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek translate failed';
    const status = message === 'DEEPSEEK_API_KEY is not configured' ? 503 : 502;
    res.status(status).json({error: message});
  }
});

app.post('/api/highlights/enrich', requireAuth, async (req, res) => {
  const {originalText, contextSentence, translationZh} = req.body ?? {};
  if (!originalText) {
    res.status(400).json({error: 'originalText is required'});
    return;
  }

  try {
    const cacheKey = buildTranslationCacheKey(originalText, contextSentence ?? '');
    const cached = getCachedTranslation(cacheKey);
    const hasCachedDetails = Boolean(
      cached && (cached.lemma || cached.usageNote || cached.example || cached.note),
    );

    if (hasCachedDetails) {
      res.json({
        lemma: cached.lemma,
        usageNote: cached.usageNote,
        example: cached.example,
        note: cached.note,
        cacheHit: true,
      });
      return;
    }

    const result = await enrichHighlightWithDeepSeek({
      originalText,
      contextSentence,
      translationZh: translationZh || cached?.translationZh || '',
    });

    const saved = setCachedTranslation({
      cacheKey,
      originalText,
      contextSentence: contextSentence ?? '',
      translationZh: translationZh || cached?.translationZh || '',
      lemma: result.lemma,
      usageNote: result.usageNote,
      example: result.example,
      note: result.note,
    });

    res.json({
      lemma: saved.lemma,
      usageNote: saved.usageNote,
      example: saved.example,
      note: saved.note,
      cacheHit: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek enrich failed';
    const status = message === 'DEEPSEEK_API_KEY is not configured' ? 503 : 502;
    res.status(status).json({error: message});
  }
});

app.post('/api/articles/preprocess', requireAuth, (req, res) => {
  const {content} = req.body ?? {};
  if (!content || typeof content !== 'string') {
    res.status(400).json({error: 'content is required'});
    return;
  }

  const digest = buildSentenceCacheKey(content.slice(0, 2000));
  if (!preprocessingJobs.has(digest)) {
    const job = preprocessArticleTranslations(content)
      .catch((error) => {
        console.error('Preprocess job failed:', error);
      })
      .finally(() => {
        preprocessingJobs.delete(digest);
      });
    preprocessingJobs.set(digest, job);
  }

  res.status(202).json({
    accepted: true,
    sentenceCount: splitSentences(content).length,
  });
});

app.post('/api/articles/preprocess-status', requireAuth, (req, res) => {
  const {content} = req.body ?? {};
  if (!content || typeof content !== 'string') {
    res.status(400).json({error: 'content is required'});
    return;
  }

  const sentences = splitSentences(content);
  const digest = buildSentenceCacheKey(content.slice(0, 2000));
  let cachedCount = 0;

  for (const sentence of sentences) {
    const sentenceKey = buildSentenceCacheKey(sentence);
    if (sentenceKey && getCachedSentenceTranslation(sentenceKey)) {
      cachedCount += 1;
    }
  }

  const totalCount = sentences.length;
  const inProgress = preprocessingJobs.has(digest);
  const done = totalCount > 0 ? cachedCount >= totalCount : true;

  res.json({
    totalCount,
    cachedCount,
    inProgress,
    done,
  });
});

app.post('/api/articles/sentence-translations', requireAuth, async (req, res) => {
  const {content, cachedOnly} = req.body ?? {};
  if (!content || typeof content !== 'string') {
    res.status(400).json({error: 'content is required'});
    return;
  }

  const sentences = splitSentences(content);
  const items = [];
  let missingCount = 0;

  for (const sentence of sentences) {
    const sentenceKey = buildSentenceCacheKey(sentence);
    if (!sentenceKey) {
      continue;
    }

    let translated = getCachedSentenceTranslation(sentenceKey);
    if (!translated && !cachedOnly) {
      try {
        const result = await translateSentenceWithDeepSeek(sentence);
        translated = setCachedSentenceTranslation({
          sentenceKey,
          sentenceText: sentence,
          translationZh: result.translationZh,
        });
      } catch (_error) {
        translated = {
          sentenceText: sentence,
          translationZh: '',
          updatedAt: Date.now(),
        };
      }
    }
    if (!translated) {
      missingCount += 1;
    }

    items.push({
      source: sentence,
      translationZh: translated?.translationZh ?? '',
    });
  }

  res.json({items, missingCount});
});

app.listen(port, host, () => {
  console.log(`LineNote API listening on http://${host}:${port}`);
});
