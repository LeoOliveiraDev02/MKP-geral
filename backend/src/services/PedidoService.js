/**
 * @file PedidoService.js
 * @description Carrinho → pedidos: cotação de frete, checkout (um pedido por
 * vendedor), pagamento SIMULADO (ambiente de teste), andamento/rastreio e
 * cancelamento com devolução de estoque.
 *
 * Preço cobrado por item: o menor entre o preço efetivo do anúncio (com
 * oferta vigente) e a faixa de atacado alcançada pela quantidade. Nunca
 * confia em preço/frete vindos do cliente.
 */

const AnuncioDAO = require('../dao/AnuncioDAO');
const PedidoDAO = require('../dao/PedidoDAO');
const EnderecoDAO = require('../dao/EnderecoDAO');
const FreteService = require('./FreteService');
const NotificacaoService = require('./NotificacaoService');
const Pedido = require('../domain/Pedido');
const { getDb } = require('../db');
const { runAsSystem } = require('../db/context');
const { pagamentoSimulado } = require('../config/seguranca');
const logger = require('../utils/logger');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const FORMAS_PAGAMENTO = ['PIX', 'CARTAO', 'BOLETO'];
const MAX_QTD = 999;

const ROTULO_STATUS = {
  AGUARDANDO_PAGAMENTO: 'aguardando pagamento',
  PAGO: 'pago',
  EM_PREPARACAO: 'em preparação',
  ENVIADO: 'enviado',
  PRONTO_RETIRADA: 'pronto para retirada',
  ENTREGUE: 'entregue',
  CANCELADO: 'cancelado',
};

const arred = (v) => Math.round(v * 100) / 100;

/** Preço unitário para a quantidade (oferta vigente ou faixa de atacado). */
function precoUnitario(anuncio, quantidade) {
  let preco = anuncio.preco_efetivo;
  for (const faixa of anuncio.atacado || []) {
    if (quantidade >= faixa.quantidade_minima && faixa.preco < preco) preco = faixa.preco;
  }
  return preco;
}

function lerItens(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new BadRequestError('Informe ao menos um item.');
  }
  const somados = new Map();
  for (const item of itens) {
    const anuncioId = Number(item.anuncioId);
    const quantidade = Number(item.quantidade);
    if (!Number.isInteger(anuncioId) || anuncioId <= 0) throw new BadRequestError('Item com anúncio inválido.');
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QTD) {
      throw new BadRequestError(`A quantidade de cada item deve ser um número inteiro entre 1 e ${MAX_QTD}.`);
    }
    somados.set(anuncioId, (somados.get(anuncioId) || 0) + quantidade);
  }
  return [...somados].map(([anuncioId, quantidade]) => ({ anuncioId, quantidade }));
}

class PedidoService {
  /**
   * Agrupa o carrinho por vendedor, com preços e opções de frete.
   * @param {{itens: Array, destino?: {cidade, uf}, compradorId?: number}}
   */
  static async montarGrupos({ itens, destino, compradorId }) {
    const linhas = lerItens(itens);
    const grupos = new Map();

    for (const { anuncioId, quantidade } of linhas) {
      const anuncio = await AnuncioDAO.findById(anuncioId);
      if (!anuncio) throw new BadRequestError(`O anúncio ${anuncioId} não está mais disponível.`);
      if (compradorId && anuncio.anunciante_id === compradorId) {
        throw new BadRequestError(`Você não pode comprar o seu próprio anúncio (${anuncio.nome}).`);
      }
      if (anuncio.estoque !== null && anuncio.estoque < quantidade) {
        throw new BadRequestError(
          anuncio.estoque === 0
            ? `${anuncio.nome} está sem estoque.`
            : `Só há ${anuncio.estoque} ${anuncio.unidade} de ${anuncio.nome} em estoque.`
        );
      }
      const unitario = precoUnitario(anuncio, quantidade);
      if (!grupos.has(anuncio.anunciante_id)) {
        grupos.set(anuncio.anunciante_id, {
          vendedor_id: anuncio.anunciante_id,
          vendedor_nome: `${anuncio.vendedor_nome} ${anuncio.vendedor_sobrenome}`,
          origem: { cidade: anuncio.cidade, uf: anuncio.uf, bairro: anuncio.bairro, rua: anuncio.rua, numero: anuncio.numero },
          itens: [],
          subtotal: 0,
          peso_kg: 0,
          permite_entrega: true,
          permite_retirada: true,
        });
      }
      const grupo = grupos.get(anuncio.anunciante_id);
      const principal = (anuncio.imagens || []).find((i) => i.tipo === 'PRINCIPAL');
      grupo.itens.push({
        anuncio_id: anuncio.id,
        nome: anuncio.nome,
        unidade: anuncio.unidade,
        quantidade,
        preco_unitario: unitario,
        total: arred(unitario * quantidade),
        imagem_url: principal ? principal.url : null,
      });
      grupo.subtotal = arred(grupo.subtotal + unitario * quantidade);
      grupo.peso_kg += FreteService.pesoDaLinha(anuncio, quantidade);
      grupo.permite_entrega = grupo.permite_entrega && anuncio.permite_entrega;
      grupo.permite_retirada = grupo.permite_retirada && anuncio.permite_retirada;
    }

    return [...grupos.values()].map((g) => {
      const opcoes = [];
      if (g.permite_entrega && destino && destino.cidade && destino.uf) {
        opcoes.push({ tipo: 'ENTREGA', ...FreteService.calcular(g.origem, destino, g.peso_kg, g.subtotal) });
      }
      if (g.permite_retirada) {
        opcoes.push({ tipo: 'RETIRADA', valor: 0, prazo_min: 0, prazo_max: 0, gratis: true, endereco: g.origem });
      }
      return { ...g, peso_kg: arred(g.peso_kg), opcoes };
    });
  }

  /** POST /shipping/quote — prévia do checkout (frete por cidade/UF do destino). */
  static async cotar({ itens, cidade, uf, compradorId }) {
    const destino = cidade && uf ? { cidade, uf } : null;
    const grupos = await PedidoService.montarGrupos({ itens, destino, compradorId });
    return {
      grupos,
      estimativa: true,
      frete_gratis_acima: FreteService.FRETE_GRATIS_ACIMA,
    };
  }

  /**
   * Fecha o carrinho: um pedido por vendedor, estoque baixado atomicamente.
   * @param {{compradorId, itens, entregas: Object<vendedorId, 'ENTREGA'|'RETIRADA'>, enderecoId, formaPagamento, observacao}}
   */
  static async checkout({ compradorId, itens, entregas = {}, enderecoId, formaPagamento, observacao }) {
    if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
      throw new BadRequestError('Escolha a forma de pagamento: PIX, CARTAO ou BOLETO.');
    }

    let endereco = null;
    if (enderecoId) {
      endereco = await runAsSystem(() => EnderecoDAO.findById(Number(enderecoId)));
      if (!endereco || endereco.cliente_id !== compradorId) {
        throw new BadRequestError('Endereço de entrega inválido.');
      }
    }

    const grupos = await PedidoService.montarGrupos({
      itens,
      destino: endereco ? { cidade: endereco.cidade, uf: endereco.uf } : null,
      compradorId,
    });

    const planos = grupos.map((g) => {
      const tipo = entregas[g.vendedor_id] || entregas[String(g.vendedor_id)];
      if (tipo !== 'ENTREGA' && tipo !== 'RETIRADA') {
        throw new BadRequestError(`Escolha entrega ou retirada para os produtos de ${g.vendedor_nome}.`);
      }
      if (tipo === 'ENTREGA' && !endereco) {
        throw new BadRequestError('Informe o endereço de entrega.');
      }
      const opcao = g.opcoes.find((o) => o.tipo === tipo);
      if (!opcao) {
        throw new BadRequestError(
          tipo === 'ENTREGA'
            ? `${g.vendedor_nome} não faz entrega de todos os itens escolhidos.`
            : `${g.vendedor_nome} não oferece retirada para todos os itens escolhidos.`
        );
      }
      return { grupo: g, tipo, frete: opcao.valor };
    });

    const criados = await runAsSystem(() =>
      getDb().transaction(async (tx) => {
        const ids = [];
        for (const { grupo, tipo, frete } of planos) {
          const pedidoId = await PedidoService.gravarPedido(tx, {
            compradorId,
            vendedorId: grupo.vendedor_id,
            tipoEntrega: tipo,
            formaPagamento,
            endereco,
            itens: grupo.itens,
            frete,
            observacao,
          });
          ids.push({ id: pedidoId, vendedorId: grupo.vendedor_id, total: arred(grupo.subtotal + frete) });
        }
        return ids;
      })
    );

    for (const p of criados) {
      NotificacaoService.notificar(p.vendedorId, {
        tipo: 'PEDIDO_NOVO',
        titulo: `Novo pedido #${p.id}`,
        mensagem: `Você recebeu um pedido de R$ ${p.total.toFixed(2).replace('.', ',')}. Aguardando pagamento.`,
        link: `/vender/pedidos/${p.id}`,
      });
    }
    logger.audit('Checkout concluído', { userId: compradorId, pedidos: criados.map((p) => p.id) });

    return { pedidos: criados.map(({ id, total }) => ({ id, total })) };
  }

  /**
   * Grava pedido + itens (baixando estoque) + 1ª linha do histórico dentro de
   * `tx` (contexto de sistema). Reaproveitado por checkout, cotação e cesta.
   * Itens sem `anuncio_id` (ex: cesta) não mexem em estoque.
   */
  static async gravarPedido(tx, { compradorId, vendedorId, tipoEntrega, formaPagamento, endereco, itens, frete, observacao, origem = 'CARRINHO' }) {
    const subtotal = arred(itens.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0));
    const pedidoId = await PedidoDAO.create({
      compradorId,
      vendedorId,
      tipoEntrega,
      formaPagamento,
      ...(tipoEntrega === 'ENTREGA' ? {
        entregaRua: endereco.rua,
        entregaNumero: endereco.numero,
        entregaBairro: endereco.bairro,
        entregaCep: endereco.cep,
        entregaCidade: endereco.cidade,
        entregaUf: endereco.uf,
      } : {}),
      subtotal,
      frete,
      total: arred(subtotal + frete),
      observacao: observacao ? String(observacao).slice(0, 500) : null,
      origem,
    }, tx);

    for (const item of itens) {
      if (item.anuncio_id) {
        const baixou = await AnuncioDAO.baixarEstoque(item.anuncio_id, item.quantidade, tx);
        if (!baixou) throw new BadRequestError(`O estoque de ${item.nome} acabou enquanto você finalizava a compra.`);
      }
      await PedidoDAO.addItem({
        pedidoId,
        anuncioId: item.anuncio_id || null,
        nome: item.nome,
        unidade: item.unidade,
        precoUnitario: item.preco_unitario,
        quantidade: item.quantidade,
        imagemUrl: item.imagem_url || null,
      }, tx);
    }
    await PedidoDAO.addHistorico(pedidoId, 'AGUARDANDO_PAGAMENTO', 'Pedido criado', tx);
    return pedidoId;
  }

  /** Carrega o pedido e confere se o usuário participa dele. */
  static async carregar(id, usuarioId) {
    const pedido = await runAsSystem(() => PedidoDAO.findById(id));
    if (!pedido) throw new NotFoundError('Pedido não encontrado.');
    const entidade = new Pedido({
      id: pedido.id,
      compradorId: pedido.comprador_id,
      vendedorId: pedido.vendedor_id,
      status: pedido.status,
      tipoEntrega: pedido.tipo_entrega,
    });
    const papel = entidade.papelDe(usuarioId);
    if (!papel) throw new ForbiddenError('Você não tem acesso a este pedido.');
    return { pedido, entidade, papel };
  }

  static async detalhe({ id, usuarioId }) {
    const { pedido, entidade, papel } = await PedidoService.carregar(id, usuarioId);
    let acoes = entidade.proximosStatus(papel);
    // Sem pagamento simulado, só o gateway (webhook) confirma o pagamento.
    if (!pagamentoSimulado()) acoes = acoes.filter((s) => s !== 'PAGO');
    return { pedido: { ...pedido, papel, acoes } };
  }

  static async listar({ usuarioId, papel, status }) {
    if (status && !Pedido.STATUS.includes(status)) throw new BadRequestError('Status de pedido inválido.');
    const pedidos = await PedidoDAO.list({ usuarioId, papel, status });
    const resumo = papel === 'VENDEDOR' ? await PedidoDAO.resumoVendedor(usuarioId) : undefined;
    return { pedidos, resumo };
  }

  /**
   * Muda o status (pagar simulado, preparar, enviar com rastreio, pronto
   * para retirada, entregue, cancelar). Notifica a outra parte.
   */
  static async alterarStatus({ id, usuarioId, status, codigoRastreio, observacao }) {
    const { pedido, entidade, papel } = await PedidoService.carregar(id, usuarioId);
    if (status === 'PAGO' && !pagamentoSimulado()) {
      throw new ForbiddenError('O pagamento é confirmado automaticamente pelo meio de pagamento.');
    }
    try {
      entidade.transicionar(status, papel);
    } catch (err) {
      throw new BadRequestError(err.message);
    }

    const extra = {};
    if (status === 'ENVIADO') {
      const codigo = String(codigoRastreio || '').trim();
      if (codigo.length > 60) throw new BadRequestError('Código de rastreio muito longo.');
      extra.codigoRastreio = codigo || null;
    }

    const nota = observacao ? String(observacao).slice(0, 300) : null;
    await runAsSystem(() =>
      getDb().transaction(async (tx) => {
        await PedidoDAO.updateStatus(pedido.id, status, extra, tx);
        const texto = status === 'ENVIADO' && extra.codigoRastreio
          ? `Código de rastreio: ${extra.codigoRastreio}${nota ? ` — ${nota}` : ''}`
          : nota || (status === 'PAGO' ? 'Pagamento confirmado (simulação do ambiente de teste)' : null);
        await PedidoDAO.addHistorico(pedido.id, status, texto, tx);
        if (entidade.devolveEstoque) {
          for (const item of pedido.itens) {
            if (item.anuncio_id) await AnuncioDAO.devolverEstoque(item.anuncio_id, item.quantidade, tx);
          }
        }
      })
    );

    const destinatario = papel === 'COMPRADOR' ? pedido.vendedor_id : pedido.comprador_id;
    const link = papel === 'COMPRADOR' ? `/vender/pedidos/${pedido.id}` : `/pedidos/${pedido.id}`;
    NotificacaoService.notificar(destinatario, {
      tipo: 'PEDIDO_STATUS',
      titulo: `Pedido #${pedido.id} ${ROTULO_STATUS[status]}`,
      mensagem: status === 'ENVIADO' && extra.codigoRastreio
        ? `Seu pedido saiu para entrega. Código de rastreio: ${extra.codigoRastreio}.`
        : `O pedido #${pedido.id} agora está ${ROTULO_STATUS[status]}.`,
      link,
    });
    logger.audit('Status do pedido alterado', { userId: usuarioId, pedidoId: pedido.id, de: pedido.status, para: status });

    return PedidoService.detalhe({ id: pedido.id, usuarioId });
  }
}

PedidoService.precoUnitario = precoUnitario;

module.exports = PedidoService;
