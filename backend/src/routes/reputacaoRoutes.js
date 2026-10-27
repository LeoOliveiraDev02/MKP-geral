/**
 * @file reputacaoRoutes.js
 * @description Avaliações (/reviews), perguntas (/questions), página pública
 * do produtor (/producers) e verificação (/verification).
 */

const express = require('express');
const C = require('../controllers/ReputacaoController');
const { escritaLimiter } = require('../middlewares/rateLimitMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const upload = require('../config/multer');

const reviews = express.Router();
reviews.get('/', C.listarAvaliacoes);
reviews.post('/', authMiddleware, upload.fields([{ name: 'fotos', maxCount: 3 }]), C.avaliar);
reviews.post('/:id/reply', authMiddleware, C.responderAvaliacao);

const questions = express.Router();
questions.get('/', C.listarPerguntas);
questions.post('/', authMiddleware, escritaLimiter, C.perguntar);
questions.post('/:id/answer', authMiddleware, C.responderPergunta);
questions.delete('/:id', authMiddleware, C.excluirPergunta);

const producers = express.Router();
producers.get('/:id', C.perfilProdutor);

const verification = express.Router();
verification.use(authMiddleware);
verification.get('/', C.minhaVerificacao);
verification.post('/', C.solicitarVerificacao);

module.exports = { reviews, questions, producers, verification };
