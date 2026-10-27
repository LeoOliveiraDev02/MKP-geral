/**
 * @file index.js
 * @description Ponto de entrada central de rotas da aplicação.
 * Este arquivo unifica e organiza todas as rotas modulares da API (auth, users, addresses, categories, ads, favorites)
 * sob caminhos (prefixes) bem definidos, facilitando a manutenção e a legibilidade do código.
 */

// Importa o framework Express para habilitar o roteamento principal.
const express = require('express');

// Importação das rotas individuais segmentadas por domínios da aplicação.
const autenticacaoRotas = require('./autenticacaoRoutes');
const usuarioRotas = require('./usuarioRoutes');
const enderecoRotas = require('./enderecoRoutes');
const categoriaRotas = require('./categoriaRoutes');
const anuncioRotas = require('./anuncioRoutes');
const favoritoRotas = require('./favoritoRoutes');
const pedidoRotas = require('./pedidoRoutes');
const notificacaoRotas = require('./notificacaoRoutes');
const reputacaoRotas = require('./reputacaoRoutes');
const comunicacaoRotas = require('./comunicacaoRoutes');
const comercioRotas = require('./comercioRoutes');

// Cria uma nova instância global de roteador (Router).
const router = express.Router();

/**
 * Registro dos sub-roteadores na instância principal do roteador.
 * Cada grupo de rotas é montado sob um prefixo de URL correspondente:
 * 
 * - `/auth`: Concentra endpoints de autenticação, registro e recuperação de senha.
 * - `/users`: Concentra ações relacionadas ao perfil do usuário autenticado.
 * - `/addresses`: Concentra o gerenciamento de endereços cadastrados pelos usuários.
 * - `/categories`: Permite a visualização das categorias de anúncios.
 * - `/ads`: Trata de anúncios de produtos (criação, edição, listagem, remoção).
 * - `/favorites`: Favoritos do usuário (toggle, lista, remoção).
 */
router.use('/auth', autenticacaoRotas);
router.use('/users', usuarioRotas);
router.use('/addresses', enderecoRotas);
router.use('/categories', categoriaRotas);
router.use('/ads', anuncioRotas);
router.use('/favorites', favoritoRotas);
router.use('/orders', pedidoRotas);
router.use('/notifications', notificacaoRotas);
router.use('/reviews', reputacaoRotas.reviews);
router.use('/questions', reputacaoRotas.questions);
router.use('/producers', reputacaoRotas.producers);
router.use('/verification', reputacaoRotas.verification);
router.use('/chats', comunicacaoRotas.chats);
router.use('/claims', comunicacaoRotas.claims);
router.use('/admin', comunicacaoRotas.admin);
router.use('/quotes', comercioRotas.quotes);
router.use('/baskets', comercioRotas.baskets);
router.use('/subscriptions', comercioRotas.subscriptions);
router.use('/payments', require('./pagamentoRoutes'));

// Exporta o roteador central unificado para que o arquivo principal do servidor (app.js ou server.js)
// possa montá-lo sob o caminho base da API (geralmente sob '/api' ou '/api/v1').
module.exports = router;

