export interface ApiCard {
  id: string;
  articleId?: string;
  originalText: string;
  isImportant: boolean;
  lemma: string;
  translationZh: string;
  usageNote: string;
  example: string;
  note: string;
  start: number;
  end: number;
  createdAt?: number;
}

export interface ApiArticle {
  id: string;
  title: string;
  content: string;
  learningPoints: string[];
  fullTranslationZh: string;
  createdAt: number;
  cardCount?: number;
  cards?: ApiCard[];
}

export interface AnalyzeArticleResult {
  learningPoints: string[];
  fullTranslationZh: string;
  cards: Array<Pick<ApiCard, 'originalText' | 'lemma' | 'translationZh' | 'usageNote' | 'example' | 'note' | 'isImportant'>>;
}

export interface TranslateHighlightResult {
  translationZh: string;
  lemma: string;
  usageNote: string;
  example: string;
  note: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload.error === 'string' ? payload.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function fetchHealth() {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  return parseJsonResponse(response);
}

export async function listArticles() {
  const response = await fetch(`${API_BASE_URL}/api/articles`);
  const payload = await parseJsonResponse(response);
  return payload.items as ApiArticle[];
}

export async function getArticle(articleId: string) {
  const response = await fetch(`${API_BASE_URL}/api/articles/${articleId}`);
  return (await parseJsonResponse(response)) as ApiArticle;
}

export async function createArticle(article: ApiArticle) {
  const response = await fetch(`${API_BASE_URL}/api/articles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(article),
  });

  return (await parseJsonResponse(response)) as ApiArticle;
}

export async function analyzeArticle(input: {
  title: string;
  content: string;
  highlights?: ApiCard[];
}) {
  const response = await fetch(`${API_BASE_URL}/api/articles/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as AnalyzeArticleResult;
}

export async function translateHighlight(input: {
  originalText: string;
  contextSentence?: string;
  articleContext?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/highlights/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as TranslateHighlightResult;
}
