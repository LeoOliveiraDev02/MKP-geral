// Modelos de apresentação. Os dados vêm da API (src/app/api) e são
// convertidos para estes tipos em src/app/api/mappers.ts.

import type { LucideIcon } from 'lucide-react';

export type Category = {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
};

export type Product = {
  id: string;
  name: string;
  producer: string;
  producerAvatar: string;
  price: number;
  category: string;
  categoryId: string;
  image: string;
  images: string[];
  description: string;
  location: string;
  zona?: 'URBANA' | 'RURAL';
  publishedAt?: string;
  /** Link click-to-chat do vendedor (só no detalhe do anúncio). */
  whatsappUrl?: string | null;
};

export const PROMO_BANNERS = [
  {
    id: '1',
    title: 'Direto do Produtor',
    subtitle: 'Negocie sem intermediários, direto pelo WhatsApp',
    image: 'https://images.unsplash.com/photo-1507662228758-08d030c4820b?w=800&q=80',
    tag: 'TEMPORADA',
  },
  {
    id: '2',
    title: 'Anuncie Grátis',
    subtitle: 'Publique seus produtos e alcance compradores da sua região',
    image: 'https://images.unsplash.com/photo-1717702576954-c07131c54169?w=800&q=80',
    tag: 'VENDA',
  },
];

export type CartItem = {
  product: Product;
  quantity: number;
};

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Datas do backend: `CURRENT_TIMESTAMP` do SQLite ("AAAA-MM-DD HH:MM:SS", UTC) ou ISO. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('pt-BR');
}
