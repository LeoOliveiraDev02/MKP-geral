/**
 * @file mappers.ts
 * @description Converte os DTOs da API para os modelos de apresentação usados
 * pelos componentes (`Product`, `Category`). Toda tradução backend → UI fica
 * aqui, para os componentes não conhecerem o formato snake_case da API.
 */

import type { AnuncioDetalheVenda, AnuncioResumoVenda, CamposVenda, Categoria } from './types';
import type { Category, Product } from '../components/agro/data';
import { Apple, Carrot, LeafyGreen, Package, Sprout, Wheat, type LucideIcon } from 'lucide-react';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

function location(cidade: string, uf: string): string {
  return [cidade, uf].filter(Boolean).join(', ');
}

function camposVenda(ad: CamposVenda) {
  return {
    unidade: ad.unidade ?? 'un',
    estoque: ad.estoque ?? null,
    pesoKg: ad.peso_kg ?? null,
    precoPromocional: ad.preco_promocional ?? null,
    promocaoAte: ad.promocao_ate ?? null,
    emOferta: !!ad.em_oferta,
    permiteEntrega: ad.permite_entrega ?? true,
    permiteRetirada: ad.permite_retirada ?? true,
    notaMedia: ad.nota_media ?? null,
    totalAvaliacoes: ad.total_avaliacoes ?? 0,
  };
}

/** Item da vitrine (GET /ads, GET /ads/me/products) → Product. */
export function anuncioResumoToProduct(ad: AnuncioResumoVenda): Product {
  const producer = `${ad.vendedor_nome} ${ad.vendedor_sobrenome}`.trim();
  const image = ad.imagem_principal ?? '';
  return {
    id: String(ad.id),
    name: ad.nome,
    producer,
    producerAvatar: initials(producer),
    price: ad.preco,
    category: ad.categoria_nome,
    categoryId: String(ad.categoria_id),
    image,
    images: image ? [image] : [],
    description: ad.descricao,
    location: location(ad.cidade, ad.uf),
    zona: ad.zona,
    publishedAt: ad.data_publicacao,
    anuncianteId: String(ad.anunciante_id),
    ...camposVenda(ad),
    precoEfetivo: ad.preco_efetivo ?? ad.preco,
    vendedorVerificado: !!ad.vendedor_verificado,
    distanciaKm: ad.distancia_km ?? null,
    latitude: ad.latitude ?? null,
    longitude: ad.longitude ?? null,
  };
}

/** Detalhe (GET /ads/:id) → Product, com galeria e contato do vendedor. */
export function anuncioDetalheToProduct(ad: AnuncioDetalheVenda): Product {
  // O DAO já ordena PRINCIPAL primeiro e depois por `ordem`.
  const images = ad.imagens.map((img) => img.url);
  return {
    id: String(ad.id),
    name: ad.nome,
    producer: ad.vendedor.nome,
    producerAvatar: initials(ad.vendedor.nome),
    price: ad.preco,
    category: ad.categoria.nome,
    categoryId: String(ad.categoria.id),
    image: images[0] ?? '',
    images,
    description: ad.descricao,
    location: location(ad.localizacao.cidade, ad.localizacao.uf),
    zona: ad.localizacao.zona,
    publishedAt: ad.data_publicacao,
    whatsappUrl: ad.vendedor.link_whatsapp,
    anuncianteId: String(ad.vendedor.id),
    ...camposVenda(ad),
    precoEfetivo: ad.preco_efetivo ?? ad.preco,
    vendedorVerificado: !!ad.vendedor.verificado,
    atacado: ad.atacado ?? [],
    certificacoes: ad.certificacoes ?? [],
    vendedorFoto: ad.vendedor.foto_url ?? null,
    vendedorDesde: ad.vendedor.desde,
  };
}

// Aparência por nome de categoria (as categorias em si vêm do backend).
const CATEGORY_LOOK: Record<string, { icon: LucideIcon; color: string }> = {
  frutas: { icon: Apple, color: '#D64545' },
  legumes: { icon: Carrot, color: '#F4770B' },
  verduras: { icon: LeafyGreen, color: '#6B8E3D' },
  graos: { icon: Wheat, color: '#C08A2B' },
  outros: { icon: Package, color: '#8C5A32' },
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function categoriaToCategory(cat: Categoria): Category {
  const look = CATEGORY_LOOK[normalize(cat.nome)] ?? { icon: Sprout, color: '#8C5A32' };
  return { id: String(cat.id), name: cat.nome, ...look };
}
