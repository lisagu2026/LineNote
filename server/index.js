import dotenv from 'dotenv';
import express from 'express';
import {
  analyzeArticleWithDeepSeek,
  enrichHighlightWithDeepSeek,
  quickTranslateWithDeepSeek,
  summarizeArticleWithDeepSeek,
  translateSentenceWithDeepSeek,
} from './deepseek.js';
import {
  buildSentenceCacheKey,
  buildTranslationCacheKey,
  createArticle,
  deleteArticleById,
  deleteCardById,
  dbPath,
  getArticleById,
  getCachedTranslation,
  getCachedSentenceTranslation,
  listArticles,
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
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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

app.get('/api/articles', (req, res) => {
  const includeCards = req.query.includeCards === '1';
  const items = listArticles();

  if (!includeCards) {
    res.json({items});
    return;
  }

  const withCards = items.map((item) => getArticleById(item.id)).filter(Boolean);
  res.json({items: withCards});
});

app.get('/api/articles/:id', (req, res) => {
  const article = getArticleById(req.params.id);
  if (!article) {
    res.status(404).json({error: 'Article not found'});
    return;
  }

  res.json(article);
});

app.post('/api/articles', (req, res) => {
  const {id, title, content} = req.body ?? {};

  if (!id || !title || !content) {
    res.status(400).json({error: 'id, title, and content are required'});
    return;
  }

  try {
    const article = createArticle(req.body);
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

app.put('/api/articles/:id', (req, res) => {
  const {title, content} = req.body ?? {};
  if (!title || !content) {
    res.status(400).json({error: 'title and content are required'});
    return;
  }

  try {
    const article = upsertArticle({
      ...req.body,
      id: req.params.id,
    });
    res.json(article);
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Failed to upsert article'});
  }
});

app.delete('/api/articles/:id', (req, res) => {
  try {
    const deleted = deleteArticleById(req.params.id);
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

app.patch('/api/cards/:id', (req, res) => {
  try {
    const card = updateCardById(req.params.id, req.body ?? {});
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

app.delete('/api/cards/:id', (req, res) => {
  try {
    const deleted = deleteCardById(req.params.id);
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

app.post('/api/articles/analyze', async (req, res) => {
  const {title, content, highlights} = req.body ?? {};

  if (!title || !content) {
    res.status(400).json({error: 'title and content are required'});
    return;
  }

  if (!Array.isArray(highlights)) {
    res.status(400).json({error: 'highlights must be an array'});
    return;
  }

  try {
    const result = await analyzeArticleWithDeepSeek({title, content, highlights});
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek analysis failed';
    const status = message === 'DEEPSEEK_API_KEY is not configured' ? 503 : 502;
    res.status(status).json({error: message});
  }
});

app.post('/api/articles/summarize', async (req, res) => {
  const {title, content} = req.body ?? {};
  if (!title || !content) {
    res.status(400).json({error: 'title and content are required'});
    return;
  }

  try {
    const result = await summarizeArticleWithDeepSeek({title, content});
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek summarize failed';
    const status = message === 'DEEPSEEK_API_KEY is not configured' ? 503 : 502;
    res.status(status).json({error: message});
  }
});

app.post('/api/highlights/translate', async (req, res) => {
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

app.post('/api/highlights/enrich', async (req, res) => {
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

app.post('/api/articles/preprocess', (req, res) => {
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

app.post('/api/articles/preprocess-status', (req, res) => {
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

app.post('/api/articles/sentence-translations', async (req, res) => {
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
