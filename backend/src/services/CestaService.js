/**
 * @file CestaService.js
 * @description Cestas por assinatura: o produtor monta uma cesta recorrente
 * (semanal, quinzenal ou mensal); o cliente assina, pausa, retoma ou cancela.
 *
 * Ambiente de teste: não há cobrança recorrente automática. A cada entrega o
 * produtor clica em "gerar pedido da entrega", que cria um pedido normal
 * (origem ASSINATURA, pago pelo fluxo simulado) e agenda a próxima data.
 */

const { eq, and, desc, sql, ne } = require('drizzle-orm');
const { getDb } = require('../db');
const { cestas, assinaturas, usuarios, enderecos } = require('../db/schema');
const { runAsSystem } = require('../db/context');
const EnderecoDAO = require('../dao/EnderecoDAO');
const PedidoService = require('./PedidoService');
const ArmazenamentoService = require('./armazenamentoService');
const NotificacaoService = require('./NotificacaoService');
const logger = require('../utils/logger');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const DIAS = { SEMANAL: 7, QUINZENAL: 14, MENSAL: 30 };

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const hoje = () => new Date().toISOString().slice(0, 10);

function lerCesta(body) {
  const nome = String(body.nome || '').trim();
  const descricao = String(body.descricao || '').trim();
  const itens = String(body.itens || '').trim();
  const preco = Number(body.preco);
  const frequencia = String(body.frequencia || '').toUpperCase();
  if (nome.length < 3) throw new BadRequestError('Dê um nome à cesta.');
  if (descricao.length < 10) throw new BadRequestError('Descreva a cesta com pelo menos 10 caracteres.');
  if (itens.length < 3) throw new BadRequestError('Liste o que vem na cesta.');
  if (!Number.isFinite(preco) || preco <= 0) throw new BadRequestError('Informe o preço da cesta.');
  if (!DIAS[frequencia]) throw new BadRequestError('A frequência deve ser SEMANAL, QUINZENAL ou MENSAL.');
  return { nome: nome.slice(0, 120), descricao: descricao.slice(0, 1000), itens: itens.slice(0, 2000), preco: Math.round(preco * 100) / 100, frequencia };
}

const CAMPOS_CESTA = {
  id: cestas.id,
  vendedor_id: cestas.vendedorId,
  vendedor_nome: sql`${usuarios.nome} || ' ' || ${usuarios.sobrenome}`,
  nome: cestas.nome,
  descricao: cestas.descricao,
  itens: cestas.itens,
  preco: cestas.preco,
  frequencia: cestas.frequencia,
  imagem_url: cestas.imagemUrl,
  ativa: cestas.ativa,
  data_criacao: cestas.dataCriacao,
  assinantes: sql`(SELECT count(*) FROM "Assinatura" s WHERE s.cesta_id = ${cestas.id} AND s.status = 'ATIVA')`.mapWith(Number),
  cidade: sql`(SELECT e.cidade FROM "Anuncio" a JOIN "Endereco" e ON e.id = a.endereco_id WHERE a.anunciante_id = ${cestas.vendedorId} AND a.status = 'ATIVO' ORDER BY a.id DESC LIMIT 1)`,
  uf: sql`(SELECT e.uf FROM "Anuncio" a JOIN "Endereco" e ON e.id = a.endereco_id WHERE a.anunciante_id = ${cestas.vendedorId} AND a.status = 'ATIVO' ORDER BY a.id DESC LIMIT 1)`,
};

class CestaService {
  // ─── Produtor ───

  static async criar({ vendedorId, body, arquivo, httpReq }) {
    const dados = lerCesta(body);
    let imagemUrl = null;
    if (arquivo) {
      try {
        imagemUrl = await ArmazenamentoService.uploadImage(arquivo, httpReq);
      } catch (err) {
        throw new BadRequestError(err.message);
      }
    }
    const [{ id }] = await getDb().insert(cestas).values({ vendedorId, ...dados, imagemUrl }).returning({ id: cestas.id });
    logger.audit('Cesta criada', { userId: vendedorId, cestaId: id });
    return CestaService.detalhe({ id });
  }

  static async carregarDoVendedor(id, vendedorId) {
    const [c] = await runAsSystem(() => getDb().select().from(cestas).where(eq(cestas.id, Number(id))).limit(1));
    if (!c) throw new NotFoundError('Cesta não encontrada.');
    if (c.vendedorId !== vendedorId) throw new ForbiddenError('Esta cesta não é sua.');
    return c;
  }

  static async editar({ vendedorId, id, body, arquivo, httpReq }) {
    const atual = await CestaService.carregarDoVendedor(id, vendedorId);
    const dados = lerCesta(body);
    const campos = { ...dados };
    if (body.ativa !== undefined) campos.ativa = body.ativa === true || body.ativa === 'true';
    if (arquivo) {
      try {
        campos.imagemUrl = await ArmazenamentoService.uploadImage(arquivo, httpReq);
      } catch (err) {
        throw new BadRequestError(err.message);
      }
    }
    await getDb().update(cestas).set(campos).where(eq(cestas.id, atual.id));
    if (arquivo && atual.imagemUrl) await ArmazenamentoService.deleteImage(atual.imagemUrl);
    return CestaService.detalhe({ id });
  }

  static async minhasCestas({ vendedorId }) {
    const rows = await getDb()
      .select(CAMPOS_CESTA)
      .from(cestas)
      .innerJoin(usuarios, eq(usuarios.id, cestas.vendedorId))
      .where(eq(cestas.vendedorId, vendedorId))
      .orderBy(desc(cestas.id));
    return { cestas: rows };
  }

  /** Assinantes de uma cesta, com endereço de entrega (para o produtor montar a rota). */
  static async assinantes({ vendedorId, id }) {
    const cesta = await CestaService.carregarDoVendedor(id, vendedorId);
    const rows = await getDb()
      .select({
        id: assinaturas.id,
        cliente_id: assinaturas.clienteId,
        cliente_nome: sql`${usuarios.nome} || ' ' || ${usuarios.sobrenome}`,
        cliente_telefone: usuarios.telefone,
        status: assinaturas.status,
        tipo_entrega: assinaturas.tipoEntrega,
        proxima_entrega: assinaturas.proximaEntrega,
        data_inicio: assinaturas.dataInicio,
        rua: enderecos.rua,
        numero: enderecos.numero,
        bairro: enderecos.bairro,
        cidade: enderecos.cidade,
        uf: enderecos.uf,
      })
      .from(assinaturas)
      .innerJoin(usuarios, eq(usuarios.id, assinaturas.clienteId))
      .leftJoin(enderecos, eq(enderecos.id, assinaturas.enderecoId))
      .where(and(eq(assinaturas.cestaId, cesta.id), ne(assinaturas.status, 'CANCELADA')))
      .orderBy(assinaturas.proximaEntrega);
    return { assinantes: rows };
  }

  /** Gera o pedido da entrega atual e avança a próxima data. */
  static async gerarPedidoDaEntrega({ vendedorId, assinaturaId }) {
    const [a] = await runAsSystem(() => getDb().select().from(assinaturas).where(eq(assinaturas.id, Number(assinaturaId))).limit(1));
    if (!a) throw new NotFoundError('Assinatura não encontrada.');
    const cesta = await CestaService.carregarDoVendedor(a.cestaId, vendedorId);
    if (a.status !== 'ATIVA') throw new BadRequestError('Só assinaturas ativas geram pedido.');

    let endereco = null;
    if (a.tipoEntrega === 'ENTREGA') {
      endereco = a.enderecoId ? await runAsSystem(() => EnderecoDAO.findById(a.enderecoId)) : null;
      if (!endereco) throw new BadRequestError('O assinante não tem mais endereço de entrega cadastrado.');
    }

    const pedidoId = await runAsSystem(() =>
      getDb().transaction(async (tx) => {
        const id = await PedidoService.gravarPedido(tx, {
          compradorId: a.clienteId,
          vendedorId,
          tipoEntrega: a.tipoEntrega,
          formaPagamento: 'PIX',
          endereco,
          frete: 0,
          origem: 'ASSINATURA',
          observacao: `Entrega de ${a.proximaEntrega} da assinatura #${a.id}`,
          itens: [{ anuncio_id: null, nome: `Cesta: ${cesta.nome}`, unidade: 'un', preco_unitario: cesta.preco, quantidade: 1, imagem_url: cesta.imagemUrl }],
        });
        await tx.update(assinaturas)
          .set({ proximaEntrega: somarDias(a.proximaEntrega < hoje() ? hoje() : a.proximaEntrega, DIAS[cesta.frequencia]) })
          .where(eq(assinaturas.id, a.id));
        return id;
      })
    );
    NotificacaoService.notificar(a.clienteId, {
      tipo: 'PEDIDO_NOVO',
      titulo: `Sua cesta ${cesta.nome} está a caminho`,
      mensagem: `Pedido #${pedidoId} criado para a entrega desta ${cesta.frequencia === 'SEMANAL' ? 'semana' : 'vez'}. Confirme o pagamento.`,
      link: `/pedidos/${pedidoId}`,
    });
    return { pedido_id: pedidoId };
  }

  // ─── Público e cliente ───

  static async listarPublicas() {
    const rows = await getDb()
      .select(CAMPOS_CESTA)
      .from(cestas)
      .innerJoin(usuarios, eq(usuarios.id, cestas.vendedorId))
      .where(eq(cestas.ativa, true))
      .orderBy(desc(cestas.id))
      .limit(100);
    return { cestas: rows };
  }

  static async detalhe({ id }) {
    const [c] = await getDb()
      .select(CAMPOS_CESTA)
      .from(cestas)
      .innerJoin(usuarios, eq(usuarios.id, cestas.vendedorId))
      .where(eq(cestas.id, Number(id)))
      .limit(1);
    if (!c) throw new NotFoundError('Cesta não encontrada.');
    return { cesta: c };
  }

  static async assinar({ clienteId, cestaId, tipoEntrega, enderecoId }) {
    const { cesta } = await CestaService.detalhe({ id: cestaId });
    if (!cesta.ativa) throw new BadRequestError('Esta cesta não está aceitando assinaturas.');
    if (cesta.vendedor_id === clienteId) throw new BadRequestError('Você não pode assinar a sua própria cesta.');
    if (tipoEntrega !== 'ENTREGA' && tipoEntrega !== 'RETIRADA') throw new BadRequestError('Escolha entrega ou retirada.');
    if (tipoEntrega === 'ENTREGA') {
      const end = await runAsSystem(() => EnderecoDAO.findById(Number(enderecoId)));
      if (!end || end.cliente_id !== clienteId) throw new BadRequestError('Endereço de entrega inválido.');
    }
    const [existente] = await getDb()
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(and(eq(assinaturas.cestaId, cesta.id), eq(assinaturas.clienteId, clienteId), ne(assinaturas.status, 'CANCELADA')))
      .limit(1);
    if (existente) throw new BadRequestError('Você já assina esta cesta.');

    const [{ id }] = await getDb()
      .insert(assinaturas)
      .values({
        cestaId: cesta.id,
        clienteId,
        tipoEntrega,
        enderecoId: tipoEntrega === 'ENTREGA' ? Number(enderecoId) : null,
        proximaEntrega: somarDias(hoje(), DIAS[cesta.frequencia]),
      })
      .returning({ id: assinaturas.id });
    NotificacaoService.notificar(cesta.vendedor_id, {
      tipo: 'ASSINATURA',
      titulo: `Nova assinatura da cesta ${cesta.nome}`,
      link: '/vender/cestas',
    });
    return { id };
  }

  static async minhasAssinaturas({ clienteId }) {
    const rows = await getDb()
      .select({
        id: assinaturas.id,
        status: assinaturas.status,
        tipo_entrega: assinaturas.tipoEntrega,
        proxima_entrega: assinaturas.proximaEntrega,
        data_inicio: assinaturas.dataInicio,
        cesta_id: cestas.id,
        cesta_nome: cestas.nome,
        cesta_preco: cestas.preco,
        cesta_frequencia: cestas.frequencia,
        cesta_imagem: cestas.imagemUrl,
        vendedor_nome: sql`${usuarios.nome} || ' ' || ${usuarios.sobrenome}`,
      })
      .from(assinaturas)
      .innerJoin(cestas, eq(cestas.id, assinaturas.cestaId))
      .innerJoin(usuarios, eq(usuarios.id, cestas.vendedorId))
      .where(eq(assinaturas.clienteId, clienteId))
      .orderBy(desc(assinaturas.id));
    return { assinaturas: rows };
  }

  /** Cliente pausa, retoma ou cancela. */
  static async alterarAssinatura({ clienteId, id, status }) {
    if (!['ATIVA', 'PAUSADA', 'CANCELADA'].includes(status)) throw new BadRequestError('Status inválido.');
    const [a] = await getDb().select().from(assinaturas).where(eq(assinaturas.id, Number(id))).limit(1);
    if (!a || a.clienteId !== clienteId) throw new NotFoundError('Assinatura não encontrada.');
    if (a.status === 'CANCELADA') throw new BadRequestError('Assinatura cancelada não pode ser alterada.');
    const campos = { status };
    // Ao retomar depois da data prevista, a próxima entrega volta a contar de hoje
    if (status === 'ATIVA' && a.proximaEntrega < hoje()) {
      const [c] = await getDb().select({ frequencia: cestas.frequencia }).from(cestas).where(eq(cestas.id, a.cestaId));
      campos.proximaEntrega = somarDias(hoje(), DIAS[c.frequencia]);
    }
    await getDb().update(assinaturas).set(campos).where(eq(assinaturas.id, a.id));
    const vendedorId = await runAsSystem(async () => {
      const [c] = await getDb().select({ vendedorId: cestas.vendedorId, nome: cestas.nome }).from(cestas).where(eq(cestas.id, a.cestaId));
      return c;
    });
    const rotulo = { ATIVA: 'retomada', PAUSADA: 'pausada', CANCELADA: 'cancelada' }[status];
    NotificacaoService.notificar(vendedorId.vendedorId, {
      tipo: 'ASSINATURA', titulo: `Assinatura da cesta ${vendedorId.nome} ${rotulo}`, link: '/vender/cestas',
    });
  }
}

CestaService.somarDias = somarDias;

module.exports = CestaService;
