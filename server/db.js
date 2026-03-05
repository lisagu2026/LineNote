import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'linenote.db');

fs.mkdirSync(dataDir, {recursive: true});

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    learning_points TEXT NOT NULL DEFAULT '[]',
    full_translation_zh TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    original_text TEXT NOT NULL,
    is_important INTEGER NOT NULL DEFAULT 0,
    lemma TEXT NOT NULL DEFAULT '',
    translation_zh TEXT NOT NULL DEFAULT '',
    usage_note TEXT NOT NULL DEFAULT '',
    example TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    start_offset INTEGER NOT NULL DEFAULT 0,
    end_offset INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS translation_cache (
    cache_key TEXT PRIMARY KEY,
    original_text TEXT NOT NULL,
    context_sentence TEXT NOT NULL DEFAULT '',
    translation_zh TEXT NOT NULL,
    lemma TEXT NOT NULL DEFAULT '',
    usage_note TEXT NOT NULL DEFAULT '',
    example TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sentence_translation_cache (
    sentence_key TEXT PRIMARY KEY,
    sentence_text TEXT NOT NULL,
    translation_zh TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS summary_cache (
    cache_key TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    result_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const selectArticles = db.prepare(`
  SELECT
    a.id,
    a.title,
    a.content,
    a.learning_points,
    a.full_translation_zh,
    a.created_at,
    COUNT(c.id) AS card_count
  FROM articles a
  LEFT JOIN cards c ON c.article_id = a.id
  GROUP BY a.id
  ORDER BY a.created_at DESC
`);

const selectArticle = db.prepare(`
  SELECT
    id,
    title,
    content,
    learning_points,
    full_translation_zh,
    created_at
  FROM articles
  WHERE id = ?
`);

const selectCardsByArticle = db.prepare(`
  SELECT
    id,
    article_id,
    original_text,
    is_important,
    lemma,
    translation_zh,
    usage_note,
    example,
    note,
    start_offset,
    end_offset,
    created_at
  FROM cards
  WHERE article_id = ?
  ORDER BY created_at DESC
`);

const insertArticleStmt = db.prepare(`
  INSERT INTO articles (
    id,
    title,
    content,
    learning_points,
    full_translation_zh,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const insertCardStmt = db.prepare(`
  INSERT INTO cards (
    id,
    article_id,
    original_text,
    is_important,
    lemma,
    translation_zh,
    usage_note,
    example,
    note,
    start_offset,
    end_offset,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const deleteCardsByArticleStmt = db.prepare(`
  DELETE FROM cards WHERE article_id = ?
`);

const deleteArticleStmt = db.prepare(`
  DELETE FROM articles WHERE id = ?
`);

const deleteCardStmt = db.prepare(`
  DELETE FROM cards WHERE id = ?
`);

const updateCardStmt = db.prepare(`
  UPDATE cards
  SET
    is_important = ?,
    lemma = ?,
    translation_zh = ?,
    usage_note = ?,
    example = ?,
    note = ?,
    start_offset = ?,
    end_offset = ?
  WHERE id = ?
`);

const selectCardByIdStmt = db.prepare(`
  SELECT
    id,
    article_id,
    original_text,
    is_important,
    lemma,
    translation_zh,
    usage_note,
    example,
    note,
    start_offset,
    end_offset,
    created_at
  FROM cards
  WHERE id = ?
`);

const selectTranslationCacheStmt = db.prepare(`
  SELECT
    cache_key,
    translation_zh,
    lemma,
    usage_note,
    example,
    note,
    updated_at
  FROM translation_cache
  WHERE cache_key = ?
`);

const upsertTranslationCacheStmt = db.prepare(`
  INSERT INTO translation_cache (
    cache_key,
    original_text,
    context_sentence,
    translation_zh,
    lemma,
    usage_note,
    example,
    note,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    translation_zh = excluded.translation_zh,
    lemma = excluded.lemma,
    usage_note = excluded.usage_note,
    example = excluded.example,
    note = excluded.note,
    updated_at = excluded.updated_at
`);

const selectSentenceTranslationCacheStmt = db.prepare(`
  SELECT
    sentence_key,
    sentence_text,
    translation_zh,
    updated_at
  FROM sentence_translation_cache
  WHERE sentence_key = ?
`);

const upsertSentenceTranslationCacheStmt = db.prepare(`
  INSERT INTO sentence_translation_cache (
    sentence_key,
    sentence_text,
    translation_zh,
    updated_at
  ) VALUES (?, ?, ?, ?)
  ON CONFLICT(sentence_key) DO UPDATE SET
    translation_zh = excluded.translation_zh,
    updated_at = excluded.updated_at
`);

const selectSummaryCacheStmt = db.prepare(`
  SELECT
    cache_key,
    mode,
    result_json,
    updated_at
  FROM summary_cache
  WHERE cache_key = ?
`);

const upsertSummaryCacheStmt = db.prepare(`
  INSERT INTO summary_cache (
    cache_key,
    mode,
    result_json,
    updated_at
  ) VALUES (?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    result_json = excluded.result_json,
    updated_at = excluded.updated_at
`);

function mapArticleRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    learningPoints: JSON.parse(row.learning_points),
    fullTranslationZh: row.full_translation_zh,
    createdAt: row.created_at,
    cardCount: row.card_count ?? undefined,
  };
}

function mapCardRow(row) {
  return {
    id: row.id,
    articleId: row.article_id,
    originalText: row.original_text,
    isImportant: Boolean(row.is_important),
    lemma: row.lemma,
    translationZh: row.translation_zh,
    usageNote: row.usage_note,
    example: row.example,
    note: row.note,
    start: row.start_offset,
    end: row.end_offset,
    createdAt: row.created_at,
  };
}

export function listArticles() {
  return selectArticles.all().map(mapArticleRow);
}

export function getArticleById(articleId) {
  const article = selectArticle.get(articleId);
  if (!article) {
    return null;
  }

  return {
    ...mapArticleRow(article),
    cards: selectCardsByArticle.all(articleId).map(mapCardRow),
  };
}

const insertArticleWithCards = db.transaction((article, cards) => {
  insertArticleStmt.run(
    article.id,
    article.title,
    article.content,
    JSON.stringify(article.learningPoints),
    article.fullTranslationZh,
    article.createdAt,
  );

  for (const card of cards) {
    insertCardStmt.run(
      card.id,
      article.id,
      card.originalText,
      card.isImportant ? 1 : 0,
      card.lemma,
      card.translationZh,
      card.usageNote,
      card.example,
      card.note,
      card.start,
      card.end,
      card.createdAt,
    );
  }
});

const upsertArticleWithCards = db.transaction((article, cards) => {
  deleteCardsByArticleStmt.run(article.id);
  deleteArticleStmt.run(article.id);

  insertArticleStmt.run(
    article.id,
    article.title,
    article.content,
    JSON.stringify(article.learningPoints),
    article.fullTranslationZh,
    article.createdAt,
  );

  for (const card of cards) {
    insertCardStmt.run(
      card.id,
      article.id,
      card.originalText,
      card.isImportant ? 1 : 0,
      card.lemma,
      card.translationZh,
      card.usageNote,
      card.example,
      card.note,
      card.start,
      card.end,
      card.createdAt,
    );
  }
});

export function createArticle(input) {
  const createdAt = input.createdAt ?? Date.now();
  const article = {
    id: input.id,
    title: input.title,
    content: input.content,
    learningPoints: input.learningPoints ?? [],
    fullTranslationZh: input.fullTranslationZh ?? '',
    createdAt,
  };

  const cards = (input.cards ?? []).map((card) => ({
    id: card.id,
    originalText: card.originalText,
    isImportant: Boolean(card.isImportant),
    lemma: card.lemma ?? '',
    translationZh: card.translationZh ?? '',
    usageNote: card.usageNote ?? '',
    example: card.example ?? '',
    note: card.note ?? '',
    start: card.start ?? 0,
    end: card.end ?? 0,
    createdAt: card.createdAt ?? createdAt,
  }));

  insertArticleWithCards(article, cards);
  return getArticleById(article.id);
}

export function upsertArticle(input) {
  const createdAt = input.createdAt ?? Date.now();
  const article = {
    id: input.id,
    title: input.title,
    content: input.content,
    learningPoints: input.learningPoints ?? [],
    fullTranslationZh: input.fullTranslationZh ?? '',
    createdAt,
  };

  const cards = (input.cards ?? []).map((card) => ({
    id: card.id,
    originalText: card.originalText,
    isImportant: Boolean(card.isImportant),
    lemma: card.lemma ?? '',
    translationZh: card.translationZh ?? '',
    usageNote: card.usageNote ?? '',
    example: card.example ?? '',
    note: card.note ?? '',
    start: card.start ?? 0,
    end: card.end ?? 0,
    createdAt: card.createdAt ?? createdAt,
  }));

  upsertArticleWithCards(article, cards);
  return getArticleById(article.id);
}

export function deleteArticleById(articleId) {
  const result = deleteArticleStmt.run(articleId);
  return result.changes > 0;
}

export function deleteCardById(cardId) {
  const result = deleteCardStmt.run(cardId);
  return result.changes > 0;
}

export function updateCardById(cardId, updates = {}) {
  const current = selectCardByIdStmt.get(cardId);
  if (!current) {
    return null;
  }

  updateCardStmt.run(
    updates.isImportant !== undefined ? (updates.isImportant ? 1 : 0) : current.is_important,
    updates.lemma ?? current.lemma,
    updates.translationZh ?? current.translation_zh,
    updates.usageNote ?? current.usage_note,
    updates.example ?? current.example,
    updates.note ?? current.note,
    updates.start ?? current.start_offset,
    updates.end ?? current.end_offset,
    cardId,
  );

  const updated = selectCardByIdStmt.get(cardId);
  return updated ? mapCardRow(updated) : null;
}

function normalizeCachePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function buildTranslationCacheKey(originalText, contextSentence = '') {
  return `${normalizeCachePart(originalText)}::${normalizeCachePart(contextSentence)}`;
}

export function getCachedTranslation(cacheKey) {
  const row = selectTranslationCacheStmt.get(cacheKey);
  if (!row) {
    return null;
  }

  return {
    translationZh: row.translation_zh,
    lemma: row.lemma,
    usageNote: row.usage_note,
    example: row.example,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export function setCachedTranslation(input) {
  const updatedAt = Date.now();
  upsertTranslationCacheStmt.run(
    input.cacheKey,
    input.originalText,
    input.contextSentence ?? '',
    input.translationZh,
    input.lemma ?? '',
    input.usageNote ?? '',
    input.example ?? '',
    input.note ?? '',
    updatedAt,
  );

  return {
    translationZh: input.translationZh,
    lemma: input.lemma ?? '',
    usageNote: input.usageNote ?? '',
    example: input.example ?? '',
    note: input.note ?? '',
    updatedAt,
  };
}

export function buildSentenceCacheKey(sentenceText) {
  return normalizeCachePart(sentenceText);
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function buildSummaryCacheKey(input) {
  const mode = normalizeCachePart(input.mode || 'summarize');
  const title = normalizeCachePart(input.title || '');
  const content = String(input.content ?? '');
  const highlights = Array.isArray(input.highlights) ? input.highlights : [];
  const highlightsFingerprint = highlights
    .map((item) =>
      [
        normalizeCachePart(item.originalText),
        Number(item.start ?? 0),
        Number(item.end ?? 0),
      ].join(':'),
    )
    .join('|');

  return `${mode}:${hashText(`${title}\n${content}\n${highlightsFingerprint}`)}`;
}

export function getCachedSummary(cacheKey) {
  const row = selectSummaryCacheStmt.get(cacheKey);
  if (!row) {
    return null;
  }

  try {
    const payload = JSON.parse(row.result_json);
    return {
      mode: row.mode,
      payload,
      updatedAt: row.updated_at,
    };
  } catch (_error) {
    return null;
  }
}

export function setCachedSummary(input) {
  const updatedAt = Date.now();
  upsertSummaryCacheStmt.run(
    input.cacheKey,
    input.mode,
    JSON.stringify(input.payload),
    updatedAt,
  );

  return {
    mode: input.mode,
    payload: input.payload,
    updatedAt,
  };
}

export function getCachedSentenceTranslation(sentenceKey) {
  const row = selectSentenceTranslationCacheStmt.get(sentenceKey);
  if (!row) {
    return null;
  }

  return {
    sentenceText: row.sentence_text,
    translationZh: row.translation_zh,
    updatedAt: row.updated_at,
  };
}

export function setCachedSentenceTranslation(input) {
  const updatedAt = Date.now();
  upsertSentenceTranslationCacheStmt.run(
    input.sentenceKey,
    input.sentenceText,
    input.translationZh,
    updatedAt,
  );

  return {
    sentenceText: input.sentenceText,
    translationZh: input.translationZh,
    updatedAt,
  };
}

export {db, dbPath};
