/**
 * @file comunicacaoRoutes.js
 * @description Chat (/chats), reclamações (/claims) e administração (/admin).
 */

const express = require('express');
const C = require('../controllers/ComunicacaoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const validar = require('../middlewares/validarMiddleware');
const { escritaLimiter } = require('../middlewares/rateLimitMiddleware');
const { chats: esquema, paramsId } = require('../validacao/esquemas');

const chats = express.Router();
chats.use(authMiddleware);
chats.get('/', C.conversas);
chats.get('/unread', C.naoLidas);
// IDOR: só os dois participantes leem/escrevem (ChatService.carregar + RLS).
chats.post('/', escritaLimiter, validar({ body: esquema.iniciar }), C.iniciar);
chats.get('/:id/messages', validar({ params: paramsId, query: esquema.mensagens }), C.mensagens);
chats.post('/:id/messages', escritaLimiter, validar({ params: paramsId, body: esquema.enviar }), C.enviar);

const claims = express.Router();
claims.use(authMiddleware);
claims.get('/', C.reclamacoes);
claims.post('/', escritaLimiter, C.abrir);
claims.get('/:id', C.reclamacao);
claims.post('/:id/reply', C.responder);
claims.post('/:id/close', C.encerrar);
claims.post('/:id/mediation', C.mediacao);

const admin = express.Router();
admin.use(authMiddleware, adminMiddleware);
admin.get('/verifications', C.adminVerificacoes);
admin.post('/verifications/:id/decision', C.adminDecidirVerificacao);
admin.get('/claims', C.adminReclamacoes);
admin.get('/claims/:id', C.adminReclamacao);
admin.post('/claims/:id/decision', C.adminDecidirReclamacao);

module.exports = { chats, claims, admin };
