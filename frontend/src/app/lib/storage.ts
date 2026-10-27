/**
 * @file storage.ts
 * @description Persistência local do navegador: carrinho, vistos recentemente
 * e id anônimo de sessão (usado nas estatísticas e recomendações).
 * Tudo protegido com try/catch: em aba anônima/bloqueada o app segue sem salvar.
 */

import type { CartItem, Product } from '../components/agro/data';

const CART_KEY = 'agromundo.carrinho';
const VISTOS_KEY = 'agromundo.vistos';
const SESSAO_KEY = 'agromundo.sessao';
const MAX_VISTOS = 12;

function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // storage indisponível: segue só em memória
  }
}

/** Carrinho salvo; descarta itens corrompidos ou de versões antigas. */
export function lerCarrinho(): CartItem[] {
  const itens = ler<CartItem[]>(CART_KEY, []);
  if (!Array.isArray(itens)) return [];
  return itens.filter(
    (i) => i && i.product && typeof i.product.id === 'string' && Number.isInteger(i.quantity) && i.quantity > 0
  );
}

export function gravarCarrinho(itens: CartItem[]) {
  gravar(CART_KEY, itens);
}

/** Resumo mínimo do produto visto (para a faixa "Vistos recentemente"). */
export type ProdutoVisto = Pick<Product, 'id' | 'name' | 'image' | 'price' | 'precoEfetivo' | 'unidade' | 'category'>;

export function lerVistos(): ProdutoVisto[] {
  const itens = ler<ProdutoVisto[]>(VISTOS_KEY, []);
  return Array.isArray(itens) ? itens.filter((i) => i && i.id) : [];
}

export function registrarVisto(p: Product) {
  const resumo: ProdutoVisto = {
    id: p.id, name: p.name, image: p.image, price: p.price, precoEfetivo: p.precoEfetivo, unidade: p.unidade, category: p.category,
  };
  const lista = [resumo, ...lerVistos().filter((v) => v.id !== p.id)].slice(0, MAX_VISTOS);
  gravar(VISTOS_KEY, lista);
}

export function limparVistos() {
  gravar(VISTOS_KEY, []);
}

/** Id anônimo e estável deste navegador (não identifica a pessoa). */
export function sessaoId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(SESSAO_KEY);
  } catch {
    // sem storage: id só desta aba
  }
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem(SESSAO_KEY, id);
    } catch {
      // idem
    }
  }
  return id;
}
