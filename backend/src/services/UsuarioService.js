/**
 * @file UsuarioService.js
 * @description Camada de serviço: perfil, senha e exclusão de conta (LGPD).
 * Orquestra a entidade de domínio `Usuario` e o `UsuarioDAO`.
 */

const { hashSenha } = require('../utils/senha');
const { verificarSenhaNova } = require('../utils/politicaSenha');
const SessaoService = require('./SessaoService');
const NotificacaoService = require('./NotificacaoService');

const UsuarioDAO = require('../dao/UsuarioDAO');
const DadosPessoaisDAO = require('../dao/DadosPessoaisDAO');
const { runAsSystem } = require('../db/context');
const { validatePassword, validateEmail, validatePhone } = require('../utils/validadores');
const logger = require('../utils/logger');
const { reconstituirUsuario } = require('../domain/factories');
const { BadRequestError } = require('../errors/AppError');

class UsuarioService {
  /**
   * Atualiza dados cadastrais via operação de domínio `atualizarDados()`.
   * @returns {Promise<Object>} usuário atualizado (público).
   */
  static async updateProfile({ userId, userPublic, nome, sobrenome, email, telefone, senhaAtual, ip }) {
    if (!nome || !sobrenome || !email || !telefone) {
      throw new BadRequestError('Todos os campos (nome, sobrenome, email, telefone) devem ser preenchidos.');
    }

    if (!validateEmail(email)) {
      throw new BadRequestError('Formato de e-mail inválido.');
    }

    if (!validatePhone(telefone)) {
      throw new BadRequestError('Formato de telefone inválido.');
    }

    // RN13 — unicidade de e-mail
    // RLS: precisa enxergar contas de terceiros para checar unicidade
    const userWithEmail = await runAsSystem(() => UsuarioDAO.findByEmail(email));
    if (userWithEmail && userWithEmail.id !== userId) {
      throw new BadRequestError('O e-mail informado já está em uso por outro usuário.');
    }

    // Trocar o e-mail (= login e destino da recuperação de senha) exige a senha atual.
    const emailAntigo = userPublic.email;
    const trocouEmail = String(email).toLowerCase() !== String(emailAntigo).toLowerCase();
    if (trocouEmail) {
      const comSenha = await UsuarioDAO.findByIdWithPassword(userId);
      if (!senhaAtual || !reconstituirUsuario(comSenha).autenticar(comSenha.email, senhaAtual)) {
        throw new BadRequestError('Para alterar o e-mail, informe sua senha atual. (Entrou com o Google? Defina uma senha em "Esqueci minha senha".)');
      }
    }

    const usuarioEnt = reconstituirUsuario({ ...userPublic, id: userId });
    usuarioEnt.atualizarDados({ nome, sobrenome, email, telefone });
    await UsuarioDAO.update(userId, {
      nome: usuarioEnt.nome,
      sobrenome: usuarioEnt.sobrenome,
      email: usuarioEnt.email,
      telefone: usuarioEnt.telefone,
    });

    logger.audit('Dados cadastrais do usuário atualizados', { userId, ip, trocouEmail });
    if (trocouEmail) {
      // Avisa o endereço ANTIGO: se a conta foi tomada, o dono legítimo fica sabendo.
      NotificacaoService.alertaSeguranca(userId, {
        titulo: 'O e-mail da sua conta foi alterado',
        mensagem: `O e-mail de acesso da sua conta AgroMundo foi alterado para ${usuarioEnt.email}. Se não foi você, responda este e-mail ou fale com o suporte imediatamente.`,
        emailPara: emailAntigo,
      });
    }

    return {
      id: userId,
      nome: usuarioEnt.nome,
      sobrenome: usuarioEnt.sobrenome,
      email: usuarioEnt.email,
      telefone: usuarioEnt.telefone,
    };
  }

  /** Troca de senha com verificação da atual via `Usuario.autenticar()`. */
  static async updatePassword({ userId, senhaAtual, novaSenha, confirmarNovaSenha, sessaoAtual, ip }) {
    if (!senhaAtual || !novaSenha || !confirmarNovaSenha) {
      throw new BadRequestError('Todos os campos de senha (senha atual, nova senha e confirmação) são obrigatórios.');
    }

    if (novaSenha !== confirmarNovaSenha) {
      throw new BadRequestError('A nova senha e a confirmação não conferem.');
    }

    if (!validatePassword(novaSenha)) {
      throw new BadRequestError('A nova senha deve conter no mínimo 8 caracteres, incluindo letras maiúsculas, minúsculas, números e caracteres especiais.');
    }

    const user = await UsuarioDAO.findByIdWithPassword(userId);
    const usuarioEnt = reconstituirUsuario(user);

    if (!usuarioEnt.autenticar(usuarioEnt.email, senhaAtual)) {
      throw new BadRequestError('Senha atual inválida.');
    }

    await verificarSenhaNova(novaSenha, { email: usuarioEnt.email, nome: user.nome, sobrenome: user.sobrenome });

    const newSenhaHash = await hashSenha(novaSenha);
    usuarioEnt.senhaHash = newSenhaHash;

    await UsuarioDAO.updatePassword(userId, usuarioEnt.senhaHash);

    // Os outros aparelhos saem; este continua conectado.
    await SessaoService.revogarTodas({ usuarioId: userId, exceto: sessaoAtual, ip, motivo: 'senha alterada' });

    logger.audit('Senha do usuário atualizada com sucesso', { userId, ip });
    NotificacaoService.alertaSeguranca(userId, {
      titulo: 'Sua senha foi alterada',
      mensagem: 'A senha da sua conta foi alterada e as sessões em outros aparelhos foram encerradas. Se não foi você, use "Esqueci minha senha" agora.',
    });
  }

  /**
   * LGPD art. 18, II e V (acesso e portabilidade): todos os dados pessoais do
   * titular em JSON. Roda como o próprio usuário (RLS limita ao que é dele).
   * Mensagens: só as escritas pelo titular (as da outra parte são dados dela).
   * Nunca inclui hash de senha nem segredo de MFA.
   */
  static async exportarDados({ userId, ip }) {
    const dados = { geradoEm: new Date().toISOString(), ...(await DadosPessoaisDAO.coletar(userId)) };
    logger.audit('Exportação de dados pessoais (LGPD)', { userId, ip });
    return dados;
  }

  /** RS03 LGPD: exclusão definitiva em cascata. */
  static async deleteAccount({ userId, ip }) {
    await UsuarioDAO.delete(userId);

    logger.audit('Conta de usuário excluída (Solicitação LGPD)', { userId, ip });
  }
}

module.exports = UsuarioService;
