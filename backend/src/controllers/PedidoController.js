/**
 * @file PedidoController.js
 * @description Thin adapter HTTP para pedidos (checkout, compras, vendas, status).
 */

const PedidoService = require('../services/PedidoService');

class PedidoController {
  /** POST /orders/quote — frete e totais por vendedor (antes do checkout). */
  static async cotar(req, res, next) {
    try {
      const data = await PedidoService.cotar({
        itens: req.body.itens,
        cidade: req.body.cidade,
        uf: req.body.uf,
        compradorId: req.user ? req.user.id : null,
      });
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  /** POST /orders/checkout — cria um pedido por vendedor. */
  static async checkout(req, res, next) {
    try {
      const data = await PedidoService.checkout({
        compradorId: req.user.id,
        itens: req.body.itens,
        entregas: req.body.entregas,
        enderecoId: req.body.enderecoId,
        formaPagamento: req.body.formaPagamento,
        observacao: req.body.observacao,
      });
      return res.status(201).json({
        status: 'success',
        message: data.pedidos.length > 1
          ? `${data.pedidos.length} pedidos criados (um por produtor).`
          : 'Pedido criado com sucesso.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /orders — minhas compras. */
  static async compras(req, res, next) {
    try {
      const data = await PedidoService.listar({ usuarioId: req.user.id, papel: 'COMPRADOR', status: req.query.status });
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  /** GET /orders/sales — pedidos recebidos (vendedor). */
  static async vendas(req, res, next) {
    try {
      const data = await PedidoService.listar({ usuarioId: req.user.id, papel: 'VENDEDOR', status: req.query.status });
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  /** GET /orders/:id — detalhe com itens, linha do tempo e ações possíveis. */
  static async detalhe(req, res, next) {
    try {
      const data = await PedidoService.detalhe({ id: req.params.id, usuarioId: req.user.id });
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /orders/:id/status — pagar (simulado), preparar, enviar, entregar, cancelar. */
  static async alterarStatus(req, res, next) {
    try {
      const data = await PedidoService.alterarStatus({
        id: req.params.id,
        usuarioId: req.user.id,
        status: req.body.status,
        codigoRastreio: req.body.codigoRastreio,
        observacao: req.body.observacao,
      });
      return res.status(200).json({ status: 'success', message: 'Pedido atualizado.', data });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PedidoController;
