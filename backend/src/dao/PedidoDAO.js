/**
 * @file PedidoDAO.js (Drizzle)
 * @description Pedidos, itens e linha do tempo (rastreio). RLS: só comprador
 * e vendedor enxergam o pedido; o checkout grava como sistema.
 */

const { eq, and, desc, asc, inArray, sql } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { getDb } = require('../db');
const { pedidos, itensPedido, historicoPedido, usuarios, avaliacoes, reclamacoes } = require('../db/schema');

const comprador = alias(usuarios, 'comprador');
const vendedor = alias(usuarios, 'vendedor');

const CAMPOS = {
  id: pedidos.id,
  comprador_id: pedidos.compradorId,
  vendedor_id: pedidos.vendedorId,
  status: pedidos.status,
  tipo_entrega: pedidos.tipoEntrega,
  forma_pagamento: pedidos.formaPagamento,
  entrega_rua: pedidos.entregaRua,
  entrega_numero: pedidos.entregaNumero,
  entrega_bairro: pedidos.entregaBairro,
  entrega_cep: pedidos.entregaCep,
  entrega_cidade: pedidos.entregaCidade,
  entrega_uf: pedidos.entregaUf,
  subtotal: pedidos.subtotal,
  frete: pedidos.frete,
  total: pedidos.total,
  codigo_rastreio: pedidos.codigoRastreio,
  observacao: pedidos.observacao,
  origem: pedidos.origem,
  data_criacao: pedidos.dataCriacao,
  data_atualizacao: pedidos.dataAtualizacao,
  comprador_nome: sql`${comprador.nome} || ' ' || ${comprador.sobrenome}`,
  comprador_telefone: comprador.telefone,
  vendedor_nome: sql`${vendedor.nome} || ' ' || ${vendedor.sobrenome}`,
  vendedor_telefone: vendedor.telefone,
};

function itemLegado(row) {
  return {
    id: row.id,
    pedido_id: row.pedidoId,
    anuncio_id: row.anuncioId,
    nome: row.nome,
    unidade: row.unidade,
    preco_unitario: row.precoUnitario,
    quantidade: row.quantidade,
    imagem_url: row.imagemUrl,
  };
}

class PedidoDAO {
  static async create(dados, client) {
    const database = client || getDb();
    const [row] = await database.insert(pedidos).values(dados).returning({ id: pedidos.id });
    return row.id;
  }

  static async addItem(item, client) {
    const database = client || getDb();
    await database.insert(itensPedido).values(item);
  }

  static async addHistorico(pedidoId, status, observacao, client) {
    const database = client || getDb();
    await database.insert(historicoPedido).values({ pedidoId, status, observacao: observacao ?? null });
  }

  static async updateStatus(id, status, extra = {}, client) {
    const database = client || getDb();
    await database
      .update(pedidos)
      .set({
        status,
        ...extra,
        dataAtualizacao: sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')`,
      })
      .where(eq(pedidos.id, Number(id)));
  }

  static async itens(pedidoIds, client) {
    if (!pedidoIds.length) return [];
    const database = client || getDb();
    const rows = await database
      .select()
      .from(itensPedido)
      .where(inArray(itensPedido.pedidoId, pedidoIds))
      .orderBy(asc(itensPedido.id));
    return rows.map(itemLegado);
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [pedido] = await database
      .select(CAMPOS)
      .from(pedidos)
      .innerJoin(comprador, eq(comprador.id, pedidos.compradorId))
      .innerJoin(vendedor, eq(vendedor.id, pedidos.vendedorId))
      .where(eq(pedidos.id, Number(id)))
      .limit(1);
    if (!pedido) return null;

    const itens = await PedidoDAO.itens([pedido.id], database);
    const historico = await database
      .select({ status: historicoPedido.status, observacao: historicoPedido.observacao, data: historicoPedido.data })
      .from(historicoPedido)
      .where(eq(historicoPedido.pedidoId, pedido.id))
      .orderBy(asc(historicoPedido.id));
    const avaliados = await database
      .select({ anuncio_id: avaliacoes.anuncioId })
      .from(avaliacoes)
      .where(eq(avaliacoes.pedidoId, pedido.id));
    const [reclamacao] = await database
      .select({ id: reclamacoes.id, status: reclamacoes.status })
      .from(reclamacoes)
      .where(eq(reclamacoes.pedidoId, pedido.id))
      .limit(1);

    const avaliadosSet = new Set(avaliados.map((a) => a.anuncio_id));
    return {
      ...pedido,
      itens: itens.map((i) => ({ ...i, avaliado: avaliadosSet.has(i.anuncio_id) })),
      historico,
      reclamacao: reclamacao || null,
    };
  }

  /** Lista do comprador ou do vendedor (`papel`), recentes primeiro, com itens. */
  static async list({ usuarioId, papel, status }, client) {
    const database = client || getDb();
    const conditions = [papel === 'VENDEDOR' ? eq(pedidos.vendedorId, usuarioId) : eq(pedidos.compradorId, usuarioId)];
    if (status) conditions.push(eq(pedidos.status, status));
    const rows = await database
      .select(CAMPOS)
      .from(pedidos)
      .innerJoin(comprador, eq(comprador.id, pedidos.compradorId))
      .innerJoin(vendedor, eq(vendedor.id, pedidos.vendedorId))
      .where(and(...conditions))
      .orderBy(desc(pedidos.id))
      .limit(100);
    const itens = await PedidoDAO.itens(rows.map((r) => r.id), database);
    const porPedido = new Map();
    for (const item of itens) {
      if (!porPedido.has(item.pedido_id)) porPedido.set(item.pedido_id, []);
      porPedido.get(item.pedido_id).push(item);
    }
    return rows.map((r) => ({ ...r, itens: porPedido.get(r.id) || [] }));
  }

  /** Resumo por status para os contadores do painel do vendedor. */
  static async resumoVendedor(vendedorId, client) {
    const database = client || getDb();
    const rows = await database
      .select({ status: pedidos.status, total: sql`count(*)`.mapWith(Number), valor: sql`coalesce(sum(${pedidos.total}), 0)`.mapWith(Number) })
      .from(pedidos)
      .where(eq(pedidos.vendedorId, vendedorId))
      .groupBy(pedidos.status);
    return rows;
  }
}

module.exports = PedidoDAO;
