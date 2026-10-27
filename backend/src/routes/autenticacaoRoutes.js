/**
 * @file authRoutes.js
 * @description Rotas de autenticação e gerenciamento de credenciais (Cadastro, Login, Recuperação de Senha).
 * Estes endpoints lidam com fluxo de credenciais sensíveis e, por boas práticas de segurança,
 * utilizam requisições HTTP POST para transmitir informações protegidas no corpo da mensagem (request body).
 */

// Importa o framework Express para gerenciar o roteamento.
const express = require('express');

// Importa o AutenticacaoController que implementa as regras de negócio para registro, login e redefinição de senha.
const AutenticacaoController = require('../controllers/AutenticacaoController');

// Logout exige sessão ativa.
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/rateLimitMiddleware');
const validar = require('../middlewares/validarMiddleware');
const { auth: esquema } = require('../validacao/esquemas');

// Cria uma nova instância de roteador do Express.
const router = express.Router();

/**
 * Rota: POST /register
 * Descrição: Registra um novo usuário no sistema. Recebe dados como nome, email, senha e CPF/CNPJ.
 * Mapeamento: AutenticacaoController.register
 */
router.post('/register', authLimiter, validar({ body: esquema.register }), AutenticacaoController.register);

/**
 * Rota: POST /login
 * Descrição: Autentica um usuário existente com email e senha, retornando um token JWT caso as credenciais estejam corretas.
 * Mapeamento: AutenticacaoController.login
 */
router.post('/login', authLimiter, validar({ body: esquema.login }), AutenticacaoController.login);

/**
 * Rota: POST /google
 * Descrição: Login/cadastro com Google. Recebe `credential` (ID token do Google Identity Services),
 * valida no servidor e devolve o mesmo JWT do login tradicional.
 * Mapeamento: AutenticacaoController.loginWithGoogle
 */
router.post('/google', authLimiter, validar({ body: esquema.google }), AutenticacaoController.loginWithGoogle);

/**
 * Rota: POST /forgot-password
 * Descrição: Solicita um link/token de recuperação de senha por e-mail para um usuário que esqueceu seus dados.
 * Mapeamento: AutenticacaoController.forgotPassword
 */
router.post('/forgot-password', authLimiter, validar({ body: esquema.forgot }), AutenticacaoController.forgotPassword);

/**
 * Rota: POST /reset-password
 * Descrição: Realiza a redefinição de senha efetiva, recebendo a nova senha e o token de validação enviado no fluxo anterior.
 * Mapeamento: AutenticacaoController.resetPassword
 */
router.post('/reset-password', authLimiter, validar({ body: esquema.reset }), AutenticacaoController.resetPassword);

/**
 * Rota: POST /logout
 * Descrição: Encerra a sessão revogando o JWT atual (UC13). Exige autenticação.
 * Mapeamento: AutenticacaoController.logout
 */
router.post('/logout', authMiddleware, AutenticacaoController.logout);

/**
 * Verificação em duas etapas (TOTP) — obrigatória para administradores.
 * - POST /mfa/verify: conclui o login (mfaToken do /login + código do app)
 * - GET  /mfa: status; POST /mfa/setup | /mfa/enable | /mfa/disable: gerenciar
 */
router.post('/mfa/verify', authLimiter, validar({ body: esquema.mfaVerify }), AutenticacaoController.mfaVerify);
router.get('/mfa', authMiddleware, AutenticacaoController.mfaStatus);
router.post('/mfa/setup', authMiddleware, AutenticacaoController.mfaSetup);
router.post('/mfa/enable', authLimiter, authMiddleware, validar({ body: esquema.mfaCodigo }), AutenticacaoController.mfaEnable);
router.post('/mfa/disable', authLimiter, authMiddleware, validar({ body: esquema.mfaCodigo }), AutenticacaoController.mfaDisable);
router.post('/mfa/recovery-codes', authLimiter, authMiddleware, validar({ body: esquema.mfaCodigo }), AutenticacaoController.mfaRegenerarCodigos);

/**
 * Sessões ativas (dispositivos conectados):
 * - GET    /sessions            lista (a atual vem com `atual: true`)
 * - DELETE /sessions/:sessaoId  encerra uma sessão
 * - POST   /logout-all          sai de todos os dispositivos
 */
router.get('/sessions', authMiddleware, AutenticacaoController.listarSessoes);
router.delete('/sessions/:sessaoId', authMiddleware, validar({ params: esquema.sessaoParams }), AutenticacaoController.encerrarSessao);
router.post('/logout-all', authMiddleware, AutenticacaoController.logoutAll);

// Exporta o roteador configurado para ser integrado ao ponto central de rotas.
module.exports = router;

