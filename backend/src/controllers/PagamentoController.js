/**
 * @file PagamentoController.js
 * @description Thin adapter HTTP do webhook do gateway de pagamento: entrega o
 * corpo BRUTO (express.raw, registrado em app.js) e a assinatura ao
 * PagamentoService, que valida e processa.
 */

const PagamentoService = require('../services/PagamentoService');

class PagamentoController {
  /** POST /payments/webhook */
  static async webhook(req, res, next) {
    try {
      const { resultado } = await PagamentoService.processarWebhook({
        corpoBruto: Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '',
        assinatura: req.headers['x-webhook-signature'],
        ip: req.ip,
      });
      return res.status(200).json({ status: 'success', data: { resultado } });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PagamentoController;
