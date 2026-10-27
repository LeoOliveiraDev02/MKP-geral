/**
 * @file pedidoRoutes.js
 * @description Rotas de pedidos. A cotação de frete é pública (carrinho de
 * visitante); o resto exige JWT.
 */

const express = require('express');
const PedidoController = require('../controllers/PedidoController');
const authMiddleware = require('../middlewares/authMiddleware');
const optionalAuthMiddleware = require('../middlewares/optionalAuthMiddleware');
const validar = require('../middlewares/validarMiddleware');
const { pedidos: esquema, paramsId } = require('../validacao/esquemas');

const router = express.Router();

// Frete estimado e totais por produtor (antes do login também)
router.post('/quote', optionalAuthMiddleware, validar({ body: esquema.cotar }), PedidoController.cotar);

router.use(authMiddleware);

// Autorização por recurso (IDOR): o service só devolve/altera pedidos dos
// quais o usuário é comprador ou vendedor (e o RLS repete a regra no banco).
router.post('/checkout', validar({ body: esquema.checkout }), PedidoController.checkout);
router.get('/', validar({ query: esquema.listar }), PedidoController.compras);
router.get('/sales', validar({ query: esquema.listar }), PedidoController.vendas);
router.get('/:id', validar({ params: paramsId }), PedidoController.detalhe);
router.patch('/:id/status', validar({ params: paramsId, body: esquema.status }), PedidoController.alterarStatus);

module.exports = router;
