/**
 * @file AppContext.tsx
 * @description Estado global compartilhado pelas páginas: sessão, carrinho
 * (salvo no navegador), favoritos, categorias e contadores do cabeçalho
 * (notificações e mensagens não lidas). Fornecido pelo App.
 */

import { createContext, useContext } from 'react';
import type { CartItem, Category, Product } from './components/agro/data';
import type { Notificacao, Usuario } from './api/types';

export type CarrinhoApi = {
  itens: CartItem[];
  /** Soma quantidades (respeitando o estoque conhecido do anúncio). */
  adicionar: (produto: Product, quantidade?: number) => void;
  atualizar: (produtoId: string, quantidade: number) => void;
  remover: (produtoId: string) => void;
  limpar: () => void;
  totalItens: number;
};

export type AppState = {
  user: Usuario | null;
  /** false enquanto o token salvo ainda está sendo validado no boot */
  sessionReady: boolean;
  categories: Category[];
  favorites: string[];
  toggleFavorite: (anuncioId: string) => void;
  setFavorites: (ids: string[]) => void;
  carrinho: CarrinhoApi;
  notificacoes: Notificacao[];
  naoLidas: number;
  mensagensNaoLidas: number;
  atualizarContadores: () => void;
  marcarNotificacao: (id: number) => void;
  marcarTodasNotificacoes: () => void;
  /** Leva ao login e volta para `destino` (padrão: página atual) depois. */
  pedirLogin: (destino?: string) => void;
  go: (caminho: string) => void;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp precisa estar dentro do AppContext.Provider');
  return ctx;
}
