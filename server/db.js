import Database from 'better-sqlite3';
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

export {db, dbPath};
