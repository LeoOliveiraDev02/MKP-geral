/**
 * @file ProdutorService.js
 * @description Página pública do produtor (perfil, vídeo, selo de
 * verificação e reputação) e edição desse perfil pelo próprio produtor.
 *
 * Reputação ("termômetro"): parte da nota média das avaliações (ou 5 quando
 * há vendas entregues sem avaliações) e desconta cancelamentos e reclamações
 * resolvidas a favor do comprador. Níveis 1 a 5; 0 = sem vendas ainda.
 */

const { eq, sql } = require('drizzle-orm');
const { getDb } = require('../db');
const { usuarios } = require('../db/schema');
const { runAsSystem } = require('../db/context');
const AvaliacaoDAO = require('../dao/AvaliacaoDAO');
const ArmazenamentoService = require('./armazenamentoService');
const { validateVideoUrl } = require('../utils/validadores');
const logger = require('../utils/logger');
const { BadRequestError, NotFoundError } = require('../errors/AppError');

const NIVEIS = [
  { min: 4.5, nivel: 5, rotulo: 'Excelente' },
  { min: 4.0, nivel: 4, rotulo: 'Muito bom' },
  { min: 3.5, nivel: 3, rotulo: 'Bom' },
  { min: 2.5, nivel: 2, rotulo: 'Regular' },
  { min: -Infinity, nivel: 1, rotulo: 'Precisa melhorar' },
];

/**
 * @param {{entregues: number, cancelados: number, total: number, reclamacoesPerdidas: number, notaMedia: number|null}} m
 */
function calcularNivel(m) {
  if (m.entregues === 0) return { nivel: 0, rotulo: 'Sem vendas concluídas' };
  const base = m.notaMedia ?? 5;
  const finalizados = m.entregues + m.cancelados;
  const taxaCancelamento = finalizados ? m.cancelados / finalizados : 0;
  const taxaReclamacao = m.entregues ? m.reclamacoesPerdidas / m.entregues : 0;
  const pontuacao = base - taxaCancelamento * 5 - taxaReclamacao * 5;
  const { nivel, rotulo } = NIVEIS.find((n) => pontuacao >= n.min);
  return { nivel, rotulo };
}

class ProdutorService {
  /** Métricas de reputação (consultadas como sistema: pedidos são privados). */
  static async reputacao(vendedorId) {
    const { rows } = await runAsSystem(() =>
      getDb().execute(sql`
        SELECT
          (SELECT count(*) FROM "Pedido" WHERE vendedor_id = ${vendedorId} AND status = 'ENTREGUE')::int AS entregues,
          (SELECT count(*) FROM "Pedido" WHERE vendedor_id = ${vendedorId} AND status = 'CANCELADO')::int AS cancelados,
          (SELECT count(*) FROM "Reclamacao" WHERE vendedor_id = ${vendedorId} AND status = 'RESOLVIDA_COMPRADOR')::int AS reclamacoes_perdidas,
          (SELECT round(avg(nota)::numeric, 1)::float FROM "Avaliacao" WHERE vendedor_id = ${vendedorId}) AS nota_media,
          (SELECT count(*) FROM "Avaliacao" WHERE vendedor_id = ${vendedorId})::int AS total_avaliacoes,
          (SELECT count(*) FROM "Anuncio" WHERE anunciante_id = ${vendedorId} AND status = 'ATIVO')::int AS anuncios_ativos
      `)
    );
    const m = rows[0];
    const finalizados = m.entregues + m.cancelados;
    return {
      vendas_concluidas: m.entregues,
      cancelamentos: m.cancelados,
      taxa_cancelamento: finalizados ? Math.round((m.cancelados / finalizados) * 100) : 0,
      reclamacoes_resolvidas_contra: m.reclamacoes_perdidas,
      nota_media: m.nota_media,
      total_avaliacoes: m.total_avaliacoes,
      anuncios_ativos: m.anuncios_ativos,
      ...calcularNivel({
        entregues: m.entregues,
        cancelados: m.cancelados,
        reclamacoesPerdidas: m.reclamacoes_perdidas,
        notaMedia: m.nota_media,
      }),
    };
  }

  /** GET /producers/:id — perfil público (só de quem tem anúncio ativo). */
  static async perfil({ id }) {
    const vendedorId = Number(id);
    if (!Number.isInteger(vendedorId)) throw new NotFoundError('Produtor não encontrado.');
    const { rows } = await runAsSystem(() =>
      getDb().execute(sql`
        SELECT u.id, u.nome, u.sobrenome, u.bio, u.video_url, u.foto_url, u.data_cadastro,
               app.usuario_verificado(u.id) AS verificado,
               e.cidade, e.uf, e.zona, e.latitude, e.longitude
        FROM "Usuario" u
        LEFT JOIN LATERAL (
          SELECT en.cidade, en.uf, en.zona, en.latitude, en.longitude
          FROM "Anuncio" a JOIN "Endereco" en ON en.id = a.endereco_id
          WHERE a.anunciante_id = u.id AND a.status = 'ATIVO'
          ORDER BY a.id DESC LIMIT 1
        ) e ON true
        WHERE u.id = ${vendedorId}
          AND EXISTS (SELECT 1 FROM "Anuncio" a WHERE a.anunciante_id = u.id AND a.status IN ('ATIVO', 'PAUSADO'))
      `)
    );
    const u = rows[0];
    if (!u) throw new NotFoundError('Produtor não encontrado.');

    const [reputacao, avaliacoes] = await Promise.all([
      ProdutorService.reputacao(vendedorId),
      AvaliacaoDAO.list({ vendedorId, limit: 10 }),
    ]);
    const resumo = await AvaliacaoDAO.resumo({ vendedorId });

    return {
      produtor: {
        id: u.id,
        nome: `${u.nome} ${u.sobrenome}`,
        bio: u.bio,
        video_url: u.video_url,
        foto_url: u.foto_url,
        desde: u.data_cadastro,
        verificado: u.verificado,
        cidade: u.cidade,
        uf: u.uf,
        zona: u.zona,
        latitude: u.latitude,
        longitude: u.longitude,
      },
      reputacao,
      avaliacoes,
      resumo_avaliacoes: resumo,
    };
  }

  /** PUT /users/profile/public — bio e vídeo da propriedade. */
  static async atualizarPerfilPublico({ usuarioId, bio, videoUrl }) {
    const campos = {};
    if (bio !== undefined) {
      const texto = String(bio || '').trim();
      if (texto.length > 1500) throw new BadRequestError('A apresentação pode ter até 1500 caracteres.');
      campos.bio = texto || null;
    }
    if (videoUrl !== undefined) {
      const url = String(videoUrl || '').trim();
      if (url && !validateVideoUrl(url)) {
        throw new BadRequestError('Use um link de vídeo do YouTube ou do Vimeo (https).');
      }
      campos.videoUrl = url || null;
    }
    if (Object.keys(campos).length) {
      await getDb().update(usuarios).set(campos).where(eq(usuarios.id, usuarioId));
    }
    return ProdutorService.meuPerfilPublico(usuarioId);
  }

  /** POST /users/profile/photo — foto/logo do produtor. */
  static async atualizarFoto({ usuarioId, arquivo, httpReq }) {
    if (!arquivo) throw new BadRequestError('Envie a imagem no campo "foto".');
    let url;
    try {
      url = await ArmazenamentoService.uploadImage(arquivo, httpReq);
    } catch (err) {
      throw new BadRequestError(err.message);
    }
    const [atual] = await getDb().select({ fotoUrl: usuarios.fotoUrl }).from(usuarios).where(eq(usuarios.id, usuarioId));
    await getDb().update(usuarios).set({ fotoUrl: url }).where(eq(usuarios.id, usuarioId));
    if (atual && atual.fotoUrl) await ArmazenamentoService.deleteImage(atual.fotoUrl);
    logger.info('Foto do produtor atualizada', { userId: usuarioId });
    return ProdutorService.meuPerfilPublico(usuarioId);
  }

  static async meuPerfilPublico(usuarioId) {
    const [u] = await getDb()
      .select({ bio: usuarios.bio, video_url: usuarios.videoUrl, foto_url: usuarios.fotoUrl })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId));
    return { perfil: u };
  }
}

ProdutorService.calcularNivel = calcularNivel;

module.exports = ProdutorService;
