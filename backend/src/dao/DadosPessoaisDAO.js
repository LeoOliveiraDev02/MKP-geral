/**
 * @file DadosPessoaisDAO.js (Drizzle)
 * @description Leitura consolidada dos dados pessoais de um titular para a
 * exportação LGPD (art. 18, II e V). Roda no contexto do próprio usuário, então
 * o RLS também restringe ao que é dele. Nunca seleciona hash de senha nem
 * segredo de MFA.
 */

const { eq, or, inArray } = require('drizzle-orm');
const { getDb } = require('../db');
const t = require('../db/schema');
const { decifrarCampo } = require('../utils/cifra');

class DadosPessoaisDAO {
  static async coletar(usuarioId, client) {
    const db = client || getDb();
    const sel = (tabela, cond) => db.select().from(tabela).where(cond);

    const [titular] = await db
      .select({
        id: t.usuarios.id, nome: t.usuarios.nome, sobrenome: t.usuarios.sobrenome, email: t.usuarios.email,
        telefone: t.usuarios.telefone, bio: t.usuarios.bio, videoUrl: t.usuarios.videoUrl,
        fotoUrl: t.usuarios.fotoUrl, dataCadastro: t.usuarios.dataCadastro,
      })
      .from(t.usuarios)
      .where(eq(t.usuarios.id, usuarioId));

    const pedidos = await sel(t.pedidos, or(eq(t.pedidos.compradorId, usuarioId), eq(t.pedidos.vendedorId, usuarioId)));
    const pedidoIds = pedidos.map((p) => p.id);

    return {
      titular,
      enderecos: await sel(t.enderecos, eq(t.enderecos.clienteId, usuarioId)),
      anuncios: await sel(t.anuncios, eq(t.anuncios.anuncianteId, usuarioId)),
      favoritos: await sel(t.favoritos, eq(t.favoritos.clienteId, usuarioId)),
      pedidos,
      itensPedido: pedidoIds.length ? await sel(t.itensPedido, inArray(t.itensPedido.pedidoId, pedidoIds)) : [],
      avaliacoesEscritas: await sel(t.avaliacoes, eq(t.avaliacoes.autorId, usuarioId)),
      perguntas: await sel(t.perguntas, eq(t.perguntas.autorId, usuarioId)),
      conversas: await sel(t.conversas, or(eq(t.conversas.compradorId, usuarioId), eq(t.conversas.vendedorId, usuarioId))),
      // Só as mensagens escritas pelo titular (as da outra parte são dados dela).
      mensagensEnviadas: await sel(t.mensagens, eq(t.mensagens.autorId, usuarioId)),
      notificacoes: await sel(t.notificacoes, eq(t.notificacoes.usuarioId, usuarioId)),
      reclamacoes: await sel(t.reclamacoes, or(eq(t.reclamacoes.compradorId, usuarioId), eq(t.reclamacoes.vendedorId, usuarioId))),
      verificacoes: (await sel(t.verificacoes, eq(t.verificacoes.usuarioId, usuarioId)))
        .map((v) => ({ ...v, documento: decifrarCampo(v.documento) })),
      cestas: await sel(t.cestas, eq(t.cestas.vendedorId, usuarioId)),
      assinaturas: await sel(t.assinaturas, eq(t.assinaturas.clienteId, usuarioId)),
      cotacoes: await sel(t.cotacoes, or(eq(t.cotacoes.clienteId, usuarioId), eq(t.cotacoes.vendedorId, usuarioId))),
    };
  }
}

module.exports = DadosPessoaisDAO;
