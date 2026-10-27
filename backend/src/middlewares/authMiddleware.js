/**
 * @file authMiddleware.js
 * @description Middleware de autenticação para proteger rotas da aplicação Agrostand.
 * Ele verifica a validade do token JWT fornecido no cabeçalho Authorization, garante que
 * o usuário associado ainda existe no banco de dados e anexa as informações do usuário
 * no objeto de requisição (req), permitindo que controladores subsequentes acessem o usuário autenticado.
 */

// Leitura do token (Bearer ou cookie HttpOnly + CSRF) e verificação do JWT.
const { lerToken, verificarSessao } = require('../utils/sessao');

// Importa o DAO de Usuário para validar a existência do usuário no banco (PostgreSQL).
const UsuarioDAO = require('../dao/UsuarioDAO');

// Denylist de logout (UC13) + hash de tokens.
const TokenRevogadoDAO = require('../dao/TokenRevogadoDAO');
const { hashToken } = require('../utils/tokens');

// Contexto do RLS (PostgreSQL): quem é o usuário das consultas desta requisição.
const { runAsUser, runAsSystem } = require('../db/context');

// Sessão no servidor: revogada, ociosa ou inexistente → 401.
const SessaoService = require('../services/SessaoService');

/**
 * Middleware que intercepta a requisição e valida a presença e integridade do token JWT.
 * 
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 * @param {Function} next - Função de callback para passar o controle ao próximo middleware ou rota.
 */
async function authMiddleware(req, res, next) {
  // Token vem do cabeçalho 'Authorization: Bearer <jwt>' (app nativo/integrações)
  // ou do cookie HttpOnly de sessão (navegador).
  const { token, origem, csrfOk } = lerToken(req);
  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Acesso negado. Token não fornecido.'
    });
  }

  // Sessão por cookie: requisições que alteram dados exigem o cabeçalho CSRF.
  if (!csrfOk) {
    return res.status(403).json({
      status: 'error',
      message: 'Requisição bloqueada: token CSRF ausente ou inválido. Recarregue a página.'
    });
  }

  try {
    // Decodifica e verifica a assinatura do token usando a chave secreta definida nas variáveis de ambiente.
    // Se o token for inválido, adulterado ou estiver expirado, um erro será lançado e capturado pelo bloco 'catch'.
    const decoded = verificarSessao(token);

    // Sessão encerrada (logout, "sair de todos", troca de senha) ou ociosa demais.
    if (!(await SessaoService.validar(decoded))) {
      return res.status(401).json({
        status: 'error',
        message: 'Sessão encerrada. Faça login novamente.'
      });
    }

    // Busca o usuário no banco de dados utilizando o ID decodificado do token payload.
    // Isso garante uma camada extra de segurança caso o usuário tenha sido excluído recentemente da plataforma.
    const user = await runAsUser(decoded.id, () => UsuarioDAO.findById(decoded.id));
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Acesso negado. Usuário não encontrado.'
      });
    }

    // Anexa o objeto do usuário ao objeto de requisição (req).
    // Dessa forma, qualquer rota ou middleware seguinte que utilize 'authMiddleware' terá acesso instantâneo a 'req.user'.
    req.user = user;

    // Expõe o token bruto para fluxos que precisam dele (ex: logout/UC13).
    req.token = token;
    req.authOrigem = origem;

    // Claims da sessão (ex: `mfa` = passou pelo segundo fator; exigido no admin).
    req.auth = decoded;

    // UC13: token revogado no logout não reentra (pós-condição do Encerrar Sessão).
    // Denylist é tabela interna (RLS: só sistema).
    if (await runAsSystem(() => TokenRevogadoDAO.existePorHash(hashToken(token)))) {
      return res.status(401).json({
        status: 'error',
        message: 'Sessão encerrada. Faça login novamente.'
      });
    }
    
    // Chama a função 'next()' para sinalizar ao Express que este middleware concluiu sua tarefa com sucesso
    // e que a requisição pode avançar para o próximo manipulador (middleware ou controller).
    // Todo o restante da requisição roda como este usuário: as policies RLS do banco
    // (app.user_id) passam a valer para cada consulta feita pelos services/DAOs.
    runAsUser(user.id, next);
  } catch (error) {
    // Trata quaisquer erros que ocorram durante a verificação do JWT (por exemplo, JsonWebTokenError ou TokenExpiredError).
    return res.status(401).json({
      status: 'error',
      message: 'Acesso negado. Token inválido ou expirado.'
    });
  }
}

// Exporta o middleware para que possa ser importado e utilizado nos arquivos de rotas.
module.exports = authMiddleware;

