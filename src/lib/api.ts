import {useStore, type AuthUser} from '../store';

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
  summaryVersions?: Array<{
    id: string;
    label: string;
    learningPoints: string[];
    fullTranslationZh: string;
    learningPointEvidences?: Array<{point: string; sourceSnippets: string[]}>;
  }>;
  selectedSummaryVersionId?: string;
  createdAt: number;
  cardCount?: number;
  cards?: ApiCard[];
}

export interface AnalyzeArticleResult {
  learningPoints: string[];
  fullTranslationZh: string;
  cards: Array<Pick<ApiCard, 'originalText' | 'lemma' | 'translationZh' | 'usageNote' | 'example' | 'note' | 'isImportant'>>;
}

export interface SummarizeArticleResult {
  learningPoints: string[];
  fullTranslationZh: string;
  learningPointEvidences?: Array<{point: string; sourceSnippets: string[]}>;
  cacheHit?: boolean;
}

export interface TranslateHighlightResult {
  translationZh: string;
  lemma: string;
  usageNote: string;
  example: string;
  note: string;
  cacheHit?: boolean;
}

export interface EnrichHighlightResult {
  lemma: string;
  usageNote: string;
  example: string;
  note: string;
  cacheHit?: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      useStore.getState().clearAuthSession();
    }
    const message =
      typeof payload.error === 'string' ? payload.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function getAuthHeaders(headers?: HeadersInit) {
  const authToken = useStore.getState().authToken;
  return {
    ...(headers ?? {}),
    ...(authToken ? {Authorization: `Bearer ${authToken}`} : {}),
  };
}

async function authFetch(path: string, init?: RequestInit) {
  const headers = getAuthHeaders(init?.headers);
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

export async function register(input: {email: string; password: string; displayName?: string}) {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as AuthResponse;
}

export async function login(input: {email: string; password: string}) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as AuthResponse;
}

export async function getCurrentUser() {
  const response = await authFetch('/api/auth/me');
  const payload = await parseJsonResponse(response);
  return payload.user as AuthUser;
}

export async function logout() {
  const response = await authFetch('/api/auth/logout', {
    method: 'POST',
  });

  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function fetchHealth() {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  return parseJsonResponse(response);
}

export async function listArticles() {
  const response = await authFetch('/api/articles');
  const payload = await parseJsonResponse(response);
  return payload.items as ApiArticle[];
}

export async function listArticlesWithCards() {
  const response = await authFetch('/api/articles?includeCards=1');
  const payload = await parseJsonResponse(response);
  return payload.items as ApiArticle[];
}

export async function getArticle(articleId: string) {
  const response = await authFetch(`/api/articles/${articleId}`);
  return (await parseJsonResponse(response)) as ApiArticle;
}

export async function createArticle(article: ApiArticle) {
  const response = await authFetch('/api/articles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(article),
  });

  return (await parseJsonResponse(response)) as ApiArticle;
}

export async function updateArticle(articleId: string, article: ApiArticle) {
  const response = await authFetch(`/api/articles/${articleId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(article),
  });

  return (await parseJsonResponse(response)) as ApiArticle;
}

export async function deleteArticle(articleId: string) {
  const response = await authFetch(`/api/articles/${articleId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function updateCard(cardId: string, card: Partial<ApiCard>) {
  const response = await authFetch(`/api/cards/${cardId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(card),
  });

  return (await parseJsonResponse(response)) as ApiCard;
}

export async function deleteCard(cardId: string) {
  const response = await authFetch(`/api/cards/${cardId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function analyzeArticle(input: {
  title: string;
  content: string;
  highlights?: ApiCard[];
  force?: boolean;
}) {
  const response = await authFetch('/api/articles/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as AnalyzeArticleResult;
}

export async function summarizeArticle(input: {title: string; content: string; highlights?: ApiCard[]; force?: boolean}) {
  const response = await authFetch('/api/articles/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as SummarizeArticleResult;
}

export async function summarizeArticleStream(
  input: {
    title: string;
    content: string;
    highlights?: ApiCard[];
    previousLearningPoints?: string[];
    regenerateRequestId?: string;
    force?: boolean;
  },
  handlers?: {
    onStatus?: (status: {
      stage: string;
      message?: string;
      totalChunks?: number;
      doneChunks?: number;
      currentChunk?: number;
      previewPoints?: string[];
    }) => void;
  },
) {
  const response = await authFetch('/api/articles/summarize-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof payload.error === 'string' ? payload.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: SummarizeArticleResult | null = null;

  while (true) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, {stream: true});
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) {
        continue;
      }

      const eventLine = lines.find((line) => line.startsWith('event:'));
      const dataLine = lines.find((line) => line.startsWith('data:'));
      const event = eventLine ? eventLine.slice(6).trim() : 'message';
      const payloadText = dataLine ? dataLine.slice(5).trim() : '{}';
      let payload: any = {};
      try {
        payload = JSON.parse(payloadText);
      } catch {
        payload = {};
      }

      if (event === 'status') {
        handlers?.onStatus?.(payload);
      } else if (event === 'result') {
        result = payload as SummarizeArticleResult;
      } else if (event === 'error') {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Stream summarize failed');
      }
    }
  }

  if (!result) {
    throw new Error('Stream summarize finished without result');
  }

  return result;
}

export async function translateHighlight(input: {
  originalText: string;
  contextSentence?: string;
  articleContext?: string;
}) {
  const response = await authFetch('/api/highlights/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as TranslateHighlightResult;
}

export async function enrichHighlight(input: {
  originalText: string;
  contextSentence?: string;
  translationZh?: string;
}) {
  const response = await authFetch('/api/highlights/enrich', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as EnrichHighlightResult;
}

export async function preprocessArticle(input: {content: string}) {
  const response = await authFetch('/api/articles/preprocess', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse(response);
}

export async function getSentenceTranslations(input: {content: string}) {
  const response = await authFetch('/api/articles/sentence-translations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as {items: Array<{source: string; translationZh: string}>; missingCount: number};
}

export async function getSentenceTranslationsCached(input: {content: string}) {
  const response = await authFetch('/api/articles/sentence-translations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({...input, cachedOnly: true}),
  });

  return (await parseJsonResponse(response)) as {items: Array<{source: string; translationZh: string}>; missingCount: number};
}

export async function getPreprocessStatus(input: {content: string}) {
  const response = await authFetch('/api/articles/preprocess-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return (await parseJsonResponse(response)) as {
    totalCount: number;
    cachedCount: number;
    inProgress: boolean;
    done: boolean;
  };
}
