/**
 * @file pagamentoRoutes.js
 * @description Webhook do gateway de pagamento. Sem JWT: a autenticação é a
 * assinatura HMAC do corpo, conferida pelo PagamentoService.
 */

const express = require('express');
const PagamentoController = require('../controllers/PagamentoController');

const router = express.Router();

router.post('/webhook', PagamentoController.webhook);

module.exports = router;
