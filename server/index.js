import dotenv from 'dotenv';
import express from 'express';
import {analyzeArticleWithDeepSeek, translateHighlightWithDeepSeek} from './deepseek.js';
import {createArticle, dbPath, getArticleById, listArticles} from './db.js';

dotenv.config({path: '.env.local'});
dotenv.config();

const app = express();
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8787);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

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

app.get('/api/articles', (_req, res) => {
  res.json({items: listArticles()});
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

app.post('/api/highlights/translate', async (req, res) => {
  const {originalText, contextSentence, articleContext} = req.body ?? {};
  if (!originalText) {
    res.status(400).json({error: 'originalText is required'});
    return;
  }

  try {
    const result = await translateHighlightWithDeepSeek({
      originalText,
      contextSentence,
      articleContext,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek translate failed';
    const status = message === 'DEEPSEEK_API_KEY is not configured' ? 503 : 502;
    res.status(status).json({error: message});
  }
});

app.listen(port, host, () => {
  console.log(`LineNote API listening on http://${host}:${port}`);
});
