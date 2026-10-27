/**
 * @file notificacaoRoutes.js
 * @description Notificações do usuário autenticado (sininho).
 */

const express = require('express');
const NotificacaoController = require('../controllers/NotificacaoController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', NotificacaoController.listar);
router.post('/read-all', NotificacaoController.marcarTodasLidas);
router.post('/:id/read', NotificacaoController.marcarLida);

module.exports = router;
