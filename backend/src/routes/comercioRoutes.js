/**
 * @file comercioRoutes.js
 * @description Cotações de atacado (/quotes), cestas (/baskets) e
 * assinaturas (/subscriptions).
 */

const express = require('express');
const C = require('../controllers/ComercioController');
const authMiddleware = require('../middlewares/authMiddleware');
const upload = require('../config/multer');
const validar = require('../middlewares/validarMiddleware');
const { escritaLimiter } = require('../middlewares/rateLimitMiddleware');
const { cotacoes: esquema, paramsId } = require('../validacao/esquemas');

const quotes = express.Router();
quotes.use(authMiddleware);
// IDOR: responder só o produtor; aceitar/cancelar só quem pediu (CotacaoService).
quotes.post('/', escritaLimiter, validar({ body: esquema.solicitar }), C.solicitarCotacao);
quotes.get('/', C.minhasCotacoes);
quotes.get('/received', C.cotacoesRecebidas);
quotes.post('/:id/reply', validar({ params: paramsId, body: esquema.responder }), C.responderCotacao);
quotes.post('/:id/accept', validar({ params: paramsId, body: esquema.aceitar }), C.aceitarCotacao);
quotes.post('/:id/cancel', validar({ params: paramsId }), C.cancelarCotacao);

const baskets = express.Router();
baskets.get('/', C.cestasPublicas);
baskets.get('/mine', authMiddleware, C.minhasCestas);
baskets.get('/:id', C.cesta);
baskets.post('/', authMiddleware, upload.single('imagem'), C.criarCesta);
baskets.put('/:id', authMiddleware, upload.single('imagem'), C.editarCesta);
baskets.get('/:id/subscribers', authMiddleware, C.assinantes);
baskets.post('/:id/subscribe', authMiddleware, C.assinar);

const subscriptions = express.Router();
subscriptions.use(authMiddleware);
subscriptions.get('/', C.minhasAssinaturas);
subscriptions.patch('/:id', C.alterarAssinatura);
subscriptions.post('/:id/delivery', C.gerarPedidoDaEntrega);

module.exports = { quotes, baskets, subscriptions };
