/**
 * @file ReclamacaoService.js
 * @description Devolução e mediação ("compra garantida" do ambiente de teste).
 *
 * Fluxo:
 *   comprador abre (pedido enviado/pronto/entregue) → ABERTA
 *   produtor responde → RESPONDIDA, ou aceita o pedido → RESOLVIDA_COMPRADOR
 *   comprador fica satisfeito → ENCERRADA, ou qualquer parte pede mediação → EM_MEDIACAO
 *   administrador decide → RESOLVIDA_COMPRADOR | RESOLVIDA_VENDEDOR
 *
 * Reembolso: não há pagamento real; a decisão a favor do comprador registra
 * "reembolso simulado" na linha do tempo do pedido. Reclamações perdidas pelo
 * produtor pesam na reputação.
 */

const { eq, or, desc, sql } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { getDb, isUniqueViolation } = require('../db');
const { reclamacoes, pedidos, usuarios } = require('../db/schema');
const { runAsSystem } = require('../db/context');
const PedidoDAO = require('../dao/PedidoDAO');
const NotificacaoService = require('./NotificacaoService');
const logger = require('../utils/logger');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const MOTIVOS = ['NAO_RECEBIDO', 'PRODUTO_DIFERENTE', 'PRODUTO_DANIFICADO', 'QUALIDADE', 'OUTRO'];
const STATUS_PEDIDO_RECLAMAVEL = ['ENVIADO', 'PRONTO_RETIRADA', 'ENTREGUE'];
const AGORA = sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')`;

const comprador = alias(usuarios, 'comprador');
const vendedor = alias(usuarios, 'vendedor');

const CAMPOS = {
  id: reclamacoes.id,
  pedido_id: reclamacoes.pedidoId,
  comprador_id: reclamacoes.compradorId,
  vendedor_id: reclamacoes.vendedorId,
  motivo: reclamacoes.motivo,
  descricao: reclamacoes.descricao,
  pedido_devolucao: reclamacoes.pedidoDevolucao,
  status: reclamacoes.status,
  resposta_vendedor: reclamacoes.respostaVendedor,
  decisao_mediacao: reclamacoes.decisaoMediacao,
  data_abertura: reclamacoes.dataAbertura,
  data_atualizacao: reclamacoes.dataAtualizacao,
  pedido_total: pedidos.total,
  comprador_nome: sql`${comprador.nome} || ' ' || ${comprador.sobrenome}`,
  vendedor_nome: sql`${vendedor.nome} || ' ' || ${vendedor.sobrenome}`,
};

function consulta(db) {
  return db
    .select(CAMPOS)
    .from(reclamacoes)
    .innerJoin(pedidos, eq(pedidos.id, reclamacoes.pedidoId))
    .innerJoin(comprador, eq(comprador.id, reclamacoes.compradorId))
    .innerJoin(vendedor, eq(vendedor.id, reclamacoes.vendedorId));
}

class ReclamacaoService {
  static async abrir({ compradorId, pedidoId, motivo, descricao, pedidoDevolucao }) {
    if (!MOTIVOS.includes(motivo)) throw new BadRequestError('Escolha o motivo da reclamação.');
    const texto = String(descricao || '').trim();
    if (texto.length < 10) throw new BadRequestError('Descreva o problema com pelo menos 10 caracteres.');
    if (texto.length > 2000) throw new BadRequestError('A descrição pode ter até 2000 caracteres.');

    const pedido = await runAsSystem(() => PedidoDAO.findById(pedidoId));
    if (!pedido) throw new NotFoundError('Pedido não encontrado.');
    if (pedido.comprador_id !== compradorId) throw new ForbiddenError('Só o comprador pode abrir uma reclamação.');
    if (!STATUS_PEDIDO_RECLAMAVEL.includes(pedido.status)) {
      throw new BadRequestError('A reclamação pode ser aberta depois que o pedido é enviado ou fica pronto para retirada.');
    }

    let id;
    try {
      [{ id }] = await getDb()
        .insert(reclamacoes)
        .values({
          pedidoId: pedido.id,
          compradorId,
          vendedorId: pedido.vendedor_id,
          motivo,
          descricao: texto,
          pedidoDevolucao: !!pedidoDevolucao,
        })
        .returning({ id: reclamacoes.id });
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError('Já existe uma reclamação para este pedido.');
      throw err;
    }
    NotificacaoService.notificar(pedido.vendedor_id, {
      tipo: 'RECLAMACAO',
      titulo: `Reclamação aberta no pedido #${pedido.id}`,
      mensagem: texto.slice(0, 160),
      link: `/reclamacoes/${id}`,
    });
    logger.audit('Reclamação aberta', { userId: compradorId, pedidoId: pedido.id, reclamacaoId: id, motivo });
    return ReclamacaoService.detalhe({ id, usuarioId: compradorId });
  }

  static async carregar(id) {
    const [r] = await runAsSystem(() => consulta(getDb()).where(eq(reclamacoes.id, Number(id))).limit(1));
    if (!r) throw new NotFoundError('Reclamação não encontrada.');
    return r;
  }

  static async detalhe({ id, usuarioId, admin = false }) {
    const r = await ReclamacaoService.carregar(id);
    if (!admin && r.comprador_id !== usuarioId && r.vendedor_id !== usuarioId) {
      throw new ForbiddenError('Você não participa desta reclamação.');
    }
    const papel = r.comprador_id === usuarioId ? 'COMPRADOR' : r.vendedor_id === usuarioId ? 'VENDEDOR' : 'ADMIN';
    return { reclamacao: { ...r, papel } };
  }

  static async listar({ usuarioId }) {
    const rows = await consulta(getDb())
      .where(or(eq(reclamacoes.compradorId, usuarioId), eq(reclamacoes.vendedorId, usuarioId)))
      .orderBy(desc(reclamacoes.id));
    return { reclamacoes: rows.map((r) => ({ ...r, papel: r.comprador_id === usuarioId ? 'COMPRADOR' : 'VENDEDOR' })) };
  }

  static async atualizar(id, campos) {
    await runAsSystem(() => getDb().update(reclamacoes).set({ ...campos, dataAtualizacao: AGORA }).where(eq(reclamacoes.id, Number(id))));
  }

  /** Produtor responde; com `aceitar`, resolve a favor do comprador. */
  static async responder({ vendedorId, id, resposta, aceitar }) {
    const r = await ReclamacaoService.carregar(id);
    if (r.vendedor_id !== vendedorId) throw new ForbiddenError('Só o produtor do pedido pode responder.');
    if (r.status !== 'ABERTA' && r.status !== 'RESPONDIDA') throw new BadRequestError('Esta reclamação não aceita mais resposta.');
    const texto = String(resposta || '').trim();
    if (texto.length < 5) throw new BadRequestError('Escreva a resposta.');
    const status = aceitar ? 'RESOLVIDA_COMPRADOR' : 'RESPONDIDA';
    await ReclamacaoService.atualizar(id, { respostaVendedor: texto.slice(0, 2000), status });
    if (aceitar) await ReclamacaoService.registrarReembolso(r, 'Produtor aceitou a reclamação');
    NotificacaoService.notificar(r.comprador_id, {
      tipo: 'RECLAMACAO',
      titulo: aceitar ? 'O produtor aceitou sua reclamação' : 'O produtor respondeu sua reclamação',
      mensagem: texto.slice(0, 160),
      link: `/reclamacoes/${r.id}`,
    });
    return ReclamacaoService.detalhe({ id, usuarioId: vendedorId });
  }

  /** Comprador encerra (satisfeito). */
  static async encerrar({ compradorId, id }) {
    const r = await ReclamacaoService.carregar(id);
    if (r.comprador_id !== compradorId) throw new ForbiddenError('Só o comprador pode encerrar a reclamação.');
    if (!['ABERTA', 'RESPONDIDA', 'EM_MEDIACAO'].includes(r.status)) throw new BadRequestError('Esta reclamação já foi finalizada.');
    await ReclamacaoService.atualizar(id, { status: 'ENCERRADA' });
    NotificacaoService.notificar(r.vendedor_id, {
      tipo: 'RECLAMACAO', titulo: `Reclamação do pedido #${r.pedido_id} encerrada pelo comprador`, link: `/reclamacoes/${r.id}`,
    });
    return ReclamacaoService.detalhe({ id, usuarioId: compradorId });
  }

  /** Qualquer parte pede mediação da plataforma. */
  static async pedirMediacao({ usuarioId, id }) {
    const r = await ReclamacaoService.carregar(id);
    if (r.comprador_id !== usuarioId && r.vendedor_id !== usuarioId) throw new ForbiddenError('Você não participa desta reclamação.');
    if (r.status !== 'ABERTA' && r.status !== 'RESPONDIDA') throw new BadRequestError('Não é possível pedir mediação agora.');
    if (r.status === 'ABERTA' && r.comprador_id === usuarioId) {
      throw new BadRequestError('Aguarde a resposta do produtor antes de pedir mediação.');
    }
    await ReclamacaoService.atualizar(id, { status: 'EM_MEDIACAO' });
    const outro = r.comprador_id === usuarioId ? r.vendedor_id : r.comprador_id;
    NotificacaoService.notificar(outro, {
      tipo: 'RECLAMACAO', titulo: `Reclamação do pedido #${r.pedido_id} em mediação`, link: `/reclamacoes/${r.id}`,
    });
    return ReclamacaoService.detalhe({ id, usuarioId });
  }

  // ─── Administração ───

  static async listarParaAdmin({ status = 'EM_MEDIACAO' }) {
    const rows = await runAsSystem(() =>
      consulta(getDb())
        .where(status === 'TODAS' ? sql`true` : eq(reclamacoes.status, status))
        .orderBy(desc(reclamacoes.id))
    );
    return { reclamacoes: rows };
  }

  static async decidir({ adminId, id, favorecido, decisao }) {
    if (favorecido !== 'COMPRADOR' && favorecido !== 'VENDEDOR') throw new BadRequestError('Decida a favor do COMPRADOR ou do VENDEDOR.');
    const texto = String(decisao || '').trim();
    if (texto.length < 5) throw new BadRequestError('Explique a decisão.');
    const r = await ReclamacaoService.carregar(id);
    if (r.status !== 'EM_MEDIACAO') throw new BadRequestError('Só reclamações em mediação podem ser decididas.');
    const status = favorecido === 'COMPRADOR' ? 'RESOLVIDA_COMPRADOR' : 'RESOLVIDA_VENDEDOR';
    await ReclamacaoService.atualizar(id, { status, decisaoMediacao: texto.slice(0, 2000) });
    if (favorecido === 'COMPRADOR') await ReclamacaoService.registrarReembolso(r, 'Mediação decidiu a favor do comprador');
    for (const destino of [r.comprador_id, r.vendedor_id]) {
      NotificacaoService.notificar(destino, {
        tipo: 'RECLAMACAO',
        titulo: `Mediação do pedido #${r.pedido_id} concluída`,
        mensagem: texto.slice(0, 160),
        link: `/reclamacoes/${r.id}`,
      });
    }
    logger.audit('Mediação decidida', { userId: adminId, reclamacaoId: r.id, favorecido });
    return ReclamacaoService.detalhe({ id, usuarioId: adminId, admin: true });
  }

  /** Ambiente de teste: só registra o reembolso na linha do tempo do pedido. */
  static async registrarReembolso(r, origem) {
    await runAsSystem(() =>
      PedidoDAO.addHistorico(
        r.pedido_id,
        'REEMBOLSO',
        `${origem}. Reembolso simulado de R$ ${Number(r.pedido_total).toFixed(2).replace('.', ',')}${r.pedido_devolucao ? ' (com devolução do produto)' : ''}.`
      )
    );
  }
}


module.exports = ReclamacaoService;
