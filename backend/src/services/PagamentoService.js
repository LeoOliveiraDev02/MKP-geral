/**
 * @file PagamentoService.js
 * @description Confirmação de pagamento via webhook do gateway (PIX, cartão,
 * boleto). Em produção é o ÚNICO caminho para um pedido virar PAGO.
 *
 * Segurança do webhook:
 * 1. Assinatura: cabeçalho `X-Webhook-Signature: t=<unix>,v1=<hex>` onde
 *    v1 = HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, `${t}.${corpoBruto}`). Comparação
 *    em tempo constante, sobre o corpo BRUTO (antes do JSON.parse).
 * 2. Anti-replay: `t` precisa estar a no máximo 5 min do relógio do servidor.
 * 3. Idempotência: cada `id` de evento é gravado uma única vez (UNIQUE).
 * 4. Valor: o valor pago tem de bater com o total do pedido calculado no
 *    servidor; divergência não confirma o pedido e fica registrada.
 *
 * Adapte `lerEvento` ao formato do gateway escolhido (Mercado Pago, Pagar.me,
 * Stripe...) — a maioria já assina os webhooks de forma equivalente.
 */

const crypto = require('crypto');
const { getDb, isUniqueViolation } = require('../db');
const { runAsSystem } = require('../db/context');
const PedidoDAO = require('../dao/PedidoDAO');
const PagamentoEventoDAO = require('../dao/PagamentoEventoDAO');
const Pedido = require('../domain/Pedido');
const NotificacaoService = require('./NotificacaoService');
const logger = require('../utils/logger');
const { BadRequestError, UnauthorizedError } = require('../errors/AppError');

const TOLERANCIA_S = 5 * 60;

function segredo() {
  const s = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!s) throw new UnauthorizedError('Webhook de pagamento não configurado.');
  return s;
}

/** Gera o cabeçalho de assinatura (usado pelos testes e por simuladores de gateway). */
function assinar(corpoBruto, timestamp = Math.floor(Date.now() / 1000), chave = segredo()) {
  const v1 = crypto.createHmac('sha256', chave).update(`${timestamp}.${corpoBruto}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function verificarAssinatura(corpoBruto, cabecalho, agora = Date.now()) {
  const partes = Object.fromEntries(
    String(cabecalho || '')
      .split(',')
      .map((p) => p.trim().split('='))
      .filter((kv) => kv.length === 2)
  );
  const t = Number(partes.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(partes.v1 || '')) {
    throw new UnauthorizedError('Assinatura do webhook ausente ou malformada.');
  }
  if (Math.abs(agora / 1000 - t) > TOLERANCIA_S) {
    throw new UnauthorizedError('Webhook expirado (timestamp fora da tolerância).');
  }
  const esperado = crypto.createHmac('sha256', segredo()).update(`${t}.${corpoBruto}`).digest();
  const recebido = Buffer.from(partes.v1, 'hex');
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    throw new UnauthorizedError('Assinatura do webhook inválida.');
  }
}

/** Formato neutro: { id, type: 'payment.approved'|'payment.failed', data: { pedidoId, valor } } */
function lerEvento(corpoBruto) {
  let evento;
  try {
    evento = JSON.parse(corpoBruto);
  } catch {
    throw new BadRequestError('Corpo do webhook não é JSON válido.');
  }
  const id = typeof evento.id === 'string' ? evento.id.slice(0, 200) : null;
  const tipo = typeof evento.type === 'string' ? evento.type.slice(0, 60) : null;
  const pedidoId = Number(evento.data && evento.data.pedidoId);
  const valor = Number(evento.data && evento.data.valor);
  if (!id || !tipo) throw new BadRequestError('Evento sem id ou tipo.');
  return { id, tipo, pedidoId: Number.isInteger(pedidoId) && pedidoId > 0 ? pedidoId : null, valor };
}

function registrar(tx, { id, tipo, pedidoId, valor }, resultado) {
  return PagamentoEventoDAO.create({ eventoId: id, tipo, pedidoId, valor, resultado }, tx);
}

class PagamentoService {
  /**
   * @param {{corpoBruto: string, assinatura: string, ip?: string}}
   * @returns {Promise<{resultado: string}>}
   */
  static async processarWebhook({ corpoBruto, assinatura, ip }) {
    verificarAssinatura(corpoBruto, assinatura);
    const evento = lerEvento(corpoBruto);

    try {
      return await runAsSystem(() =>
        getDb().transaction(async (tx) => {
          if (evento.tipo !== 'payment.approved') {
            await registrar(tx, evento, 'IGNORADO');
            return { resultado: 'IGNORADO' };
          }

          const pedido = evento.pedidoId ? await PedidoDAO.findById(evento.pedidoId, tx) : null;
          if (!pedido) {
            await registrar(tx, { ...evento, pedidoId: null }, 'PEDIDO_INEXISTENTE');
            return { resultado: 'PEDIDO_INEXISTENTE' };
          }
          if (pedido.status !== 'AGUARDANDO_PAGAMENTO') {
            await registrar(tx, evento, 'STATUS_INVALIDO');
            return { resultado: 'STATUS_INVALIDO' };
          }
          // Total vem do banco (calculado no checkout), nunca do cliente.
          if (!Number.isFinite(evento.valor) || Math.abs(evento.valor - pedido.total) > 0.009) {
            await registrar(tx, evento, 'VALOR_DIVERGENTE');
            logger.warn('Webhook com valor divergente do pedido', {
              pedidoId: pedido.id, esperado: pedido.total, recebido: evento.valor, ip,
            });
            return { resultado: 'VALOR_DIVERGENTE' };
          }

          const entidade = new Pedido({
            id: pedido.id,
            compradorId: pedido.comprador_id,
            vendedorId: pedido.vendedor_id,
            status: pedido.status,
            tipoEntrega: pedido.tipo_entrega,
          });
          entidade.transicionar('PAGO', 'GATEWAY');
          await PedidoDAO.updateStatus(pedido.id, 'PAGO', {}, tx);
          await PedidoDAO.addHistorico(pedido.id, 'PAGO', 'Pagamento confirmado pelo gateway', tx);
          await registrar(tx, evento, 'CONFIRMADO');

          NotificacaoService.notificar(pedido.vendedor_id, {
            tipo: 'PEDIDO_STATUS',
            titulo: `Pedido #${pedido.id} pago`,
            mensagem: `O pagamento do pedido #${pedido.id} foi confirmado. Já pode preparar.`,
            link: `/vender/pedidos/${pedido.id}`,
          });
          NotificacaoService.notificar(pedido.comprador_id, {
            tipo: 'PEDIDO_STATUS',
            titulo: `Pagamento do pedido #${pedido.id} confirmado`,
            mensagem: 'Recebemos o seu pagamento.',
            link: `/pedidos/${pedido.id}`,
          });
          logger.audit('Pagamento confirmado via webhook', { pedidoId: pedido.id, eventoId: evento.id, ip });
          return { resultado: 'CONFIRMADO' };
        })
      );
    } catch (error) {
      // Reentrega do mesmo evento: já processado, responde 200 sem repetir efeitos.
      if (isUniqueViolation(error, 'PagamentoEvento_evento_id_unique')) {
        return { resultado: 'DUPLICADO' };
      }
      throw error;
    }
  }
}

PagamentoService.assinar = assinar;
PagamentoService.verificarAssinatura = verificarAssinatura;

module.exports = PagamentoService;
