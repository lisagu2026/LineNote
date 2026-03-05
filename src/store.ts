import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Highlight {
  id: string;
  originalText: string;
  isImportant: boolean;
  lemma: string;
  translationZh: string;
  usageNote: string;
  example: string;
  note: string;
  start: number;
  end: number;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  learningPoints: string[];
  fullTranslationZh: string;
  createdAt: number;
}

export interface Card extends Highlight {
  articleId: string;
  createdAt: number;
}

export interface TranslationCacheEntry {
  translationZh: string;
  lemma: string;
  usageNote: string;
  example: string;
  note: string;
  updatedAt: number;
}

interface AppState {
  articleTitle: string;
  articleText: string;
  setArticle: (title: string, text: string) => void;
  highlights: Highlight[];
  replaceHighlights: (highlights: Highlight[]) => void;
  addHighlight: (highlight: Highlight) => void;
  updateHighlight: (id: string, updates: Partial<Highlight>) => void;
  removeHighlight: (id: string) => void;
  clearHighlights: () => void;

  translationCache: Record<string, TranslationCacheEntry>;
  setTranslationCache: (key: string, entry: Omit<TranslationCacheEntry, 'updatedAt'>) => void;
  clearTranslationCache: () => void;
  
  // Library State
  articles: Article[];
  cards: Card[];
  saveToLibrary: (article: Article, cards: Card[]) => void;
  updateCard: (id: string, updates: Partial<Card>) => void;
  removeArticle: (id: string) => void;
  removeCard: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      articleTitle: '',
      articleText: '',
      setArticle: (title, text) => set({ articleTitle: title, articleText: text }),
      highlights: [],
      replaceHighlights: (highlights) => set({ highlights }),
      addHighlight: (highlight) =>
        set((state) => ({ highlights: [...state.highlights, highlight] })),
      updateHighlight: (id, updates) =>
        set((state) => ({
          highlights: state.highlights.map((h) =>
            h.id === id ? { ...h, ...updates } : h
          ),
        })),
      removeHighlight: (id) =>
        set((state) => ({
          highlights: state.highlights.filter((h) => h.id !== id),
        })),
      clearHighlights: () => set({ highlights: [] }),
      translationCache: {},
      setTranslationCache: (key, entry) =>
        set((state) => ({
          translationCache: {
            ...state.translationCache,
            [key]: {
              ...entry,
              updatedAt: Date.now(),
            },
          },
        })),
      clearTranslationCache: () => set({ translationCache: {} }),
      
      articles: [],
      cards: [],
      saveToLibrary: (article, newCards) =>
        set((state) => ({
          articles: [article, ...state.articles],
          cards: [...newCards, ...state.cards],
        })),
      updateCard: (id, updates) =>
        set((state) => ({
          cards: state.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      removeArticle: (id) =>
        set((state) => ({
          articles: state.articles.filter((a) => a.id !== id),
          cards: state.cards.filter((c) => c.articleId !== id),
        })),
      removeCard: (id) =>
        set((state) => ({
          cards: state.cards.filter((c) => c.id !== id),
        })),
    }),
    {
      name: 'rus-reader-storage',
    }
  )
);
