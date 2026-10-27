/**
 * @file NotificacaoController.js
 * @description Thin adapter HTTP para as notificações do sininho.
 */

const NotificacaoService = require('../services/NotificacaoService');

class NotificacaoController {
  /** GET /notifications — últimas notificações + contador de não lidas. */
  static async listar(req, res, next) {
    try {
      const data = await NotificacaoService.listar({ usuarioId: req.user.id });
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  /** POST /notifications/:id/read */
  static async marcarLida(req, res, next) {
    try {
      await NotificacaoService.marcarLida({ usuarioId: req.user.id, id: req.params.id });
      return res.status(200).json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }

  /** POST /notifications/read-all */
  static async marcarTodasLidas(req, res, next) {
    try {
      await NotificacaoService.marcarTodasLidas({ usuarioId: req.user.id });
      return res.status(200).json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = NotificacaoController;
