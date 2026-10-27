/**
 * @file VerificacaoService.js
 * @description Selo de produtor verificado. O produtor envia CPF ou CNPJ
 * (dígitos conferidos) e, opcionalmente, o número do CAR; um administrador
 * (e-mail em ADMIN_EMAILS) aprova ou rejeita. Só APROVADA vira selo público.
 *
 * Ambiente de teste: a conferência é dos dígitos/formatos e da análise do
 * administrador — não há consulta automática à Receita Federal ou ao SICAR.
 */

const { eq, desc, sql } = require('drizzle-orm');
const { getDb, isUniqueViolation } = require('../db');
const { verificacoes, usuarios } = require('../db/schema');
const { runAsSystem } = require('../db/context');
const NotificacaoService = require('./NotificacaoService');
const { validateCpf, validateCnpj, validateCar } = require('../utils/validadores');
const logger = require('../utils/logger');
// CPF/CNPJ ficam cifrados no banco (AES-256-GCM).
const { cifrarCampo, decifrarCampo } = require('../utils/cifra');
const { BadRequestError, NotFoundError } = require('../errors/AppError');

function mascararDocumento(tipo, doc) {
  return tipo === 'CPF' ? `***.${doc.slice(3, 6)}.***-${doc.slice(9)}` : `**.${doc.slice(2, 5)}.***/${doc.slice(8, 12)}-**`;
}

function legado(row, mascarar = true) {
  const documento = decifrarCampo(row.documento);
  return {
    id: row.id,
    usuario_id: row.usuarioId,
    tipo_documento: row.tipoDocumento,
    documento: mascarar ? mascararDocumento(row.tipoDocumento, documento) : documento,
    car: row.car,
    status: row.status,
    observacao: row.observacao,
    data_envio: row.dataEnvio,
    data_decisao: row.dataDecisao,
  };
}

class VerificacaoService {
  static async minha({ usuarioId }) {
    const [row] = await getDb().select().from(verificacoes).where(eq(verificacoes.usuarioId, usuarioId)).limit(1);
    return { verificacao: row ? legado(row) : null };
  }

  /** Envia (ou reenvia após rejeição) o pedido de verificação. */
  static async solicitar({ usuarioId, tipoDocumento, documento, car }) {
    const tipo = String(tipoDocumento || '').toUpperCase();
    const doc = String(documento || '').replace(/\D/g, '');
    if (tipo !== 'CPF' && tipo !== 'CNPJ') throw new BadRequestError('Informe CPF ou CNPJ.');
    if (tipo === 'CPF' && !validateCpf(doc)) throw new BadRequestError('CPF inválido.');
    if (tipo === 'CNPJ' && !validateCnpj(doc)) throw new BadRequestError('CNPJ inválido.');
    const carLimpo = car ? String(car).replace(/\./g, '').trim().toUpperCase() : null;
    if (carLimpo && !validateCar(carLimpo)) {
      throw new BadRequestError('Número do CAR em formato inválido (ex.: MG-3152501-0F8E...).');
    }

    const [atual] = await getDb().select().from(verificacoes).where(eq(verificacoes.usuarioId, usuarioId)).limit(1);
    if (atual && atual.status !== 'REJEITADA') {
      throw new BadRequestError(atual.status === 'APROVADA' ? 'Você já é um produtor verificado.' : 'Sua verificação já está em análise.');
    }
    const agora = sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')`;
    try {
      if (atual) {
        await getDb().update(verificacoes)
          .set({ tipoDocumento: tipo, documento: cifrarCampo(doc), car: carLimpo, status: 'PENDENTE', observacao: null, dataEnvio: agora, dataDecisao: null })
          .where(eq(verificacoes.id, atual.id));
      } else {
        await getDb().insert(verificacoes).values({ usuarioId, tipoDocumento: tipo, documento: cifrarCampo(doc), car: carLimpo });
      }
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError('Sua verificação já está em análise.');
      throw err;
    }
    logger.audit('Verificação de produtor solicitada', { userId: usuarioId, tipo });
    return VerificacaoService.minha({ usuarioId });
  }

  // ─── Administração ───

  static async listarParaAdmin({ status = 'PENDENTE' }) {
    const rows = await runAsSystem(() =>
      getDb()
        .select({
          v: verificacoes,
          nome: sql`${usuarios.nome} || ' ' || ${usuarios.sobrenome}`,
          email: usuarios.email,
        })
        .from(verificacoes)
        .innerJoin(usuarios, eq(usuarios.id, verificacoes.usuarioId))
        .where(status === 'TODAS' ? sql`true` : eq(verificacoes.status, status))
        .orderBy(desc(verificacoes.id))
    );
    // Admin vê o documento completo para conferir
    return { verificacoes: rows.map((r) => ({ ...legado(r.v, false), usuario_nome: r.nome, usuario_email: r.email })) };
  }

  static async decidir({ adminId, id, status, observacao }) {
    if (status !== 'APROVADA' && status !== 'REJEITADA') throw new BadRequestError('Decida APROVADA ou REJEITADA.');
    const motivo = observacao ? String(observacao).trim().slice(0, 500) : null;
    if (status === 'REJEITADA' && !motivo) throw new BadRequestError('Explique o motivo da rejeição.');
    const [row] = await runAsSystem(() => getDb().select().from(verificacoes).where(eq(verificacoes.id, Number(id))).limit(1));
    if (!row) throw new NotFoundError('Verificação não encontrada.');
    if (row.status !== 'PENDENTE') throw new BadRequestError('Esta verificação já foi decidida.');
    await runAsSystem(() =>
      getDb().update(verificacoes)
        .set({ status, observacao: motivo, dataDecisao: sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')` })
        .where(eq(verificacoes.id, row.id))
    );
    NotificacaoService.notificar(row.usuarioId, {
      tipo: 'VERIFICACAO',
      titulo: status === 'APROVADA' ? 'Você agora é um produtor verificado' : 'Verificação não aprovada',
      mensagem: status === 'APROVADA' ? 'O selo de produtor verificado já aparece nos seus anúncios.' : motivo,
      link: '/perfil/verificacao',
    });
    logger.audit('Verificação de produtor decidida', { userId: adminId, verificacaoId: row.id, status });
  }
}

module.exports = VerificacaoService;
