/**
 * @file ShareController.js
 * @description Adapter HTTP das páginas de compartilhamento com prévia
 * (Open Graph). Busca os dados nos services e entrega à view HTML; em
 * qualquer erro (anúncio inexistente, pausado...) só redireciona ao front.
 *
 * Observação: a prévia só aparece quando o link é público (o robô do
 * WhatsApp não acessa localhost).
 */

const AnuncioService = require('../services/AnuncioService');
const ProdutorService = require('../services/ProdutorService');
const { paginaCompartilhamento } = require('../views/paginaCompartilhamento');

function frontUrl(caminho) {
  return `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}${caminho}`;
}

const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

class ShareController {
  /** @route GET /share/produto/:id */
  static async produto(req, res) {
    const destino = frontUrl(`/produto/${encodeURIComponent(req.params.id)}`);
    try {
      const ad = await AnuncioService.get({ id: req.params.id });
      const principal = ad.imagens.find((i) => i.tipo === 'PRINCIPAL') || ad.imagens[0];
      return res.type('html').send(paginaCompartilhamento({
        titulo: `${ad.nome} — ${moeda(ad.preco_efetivo)}${ad.unidade !== 'un' ? ` / ${ad.unidade}` : ''}`,
        descricao: `${ad.vendedor.nome} · ${ad.localizacao.cidade}/${ad.localizacao.uf}. ${ad.descricao}`.slice(0, 200),
        imagem: principal ? principal.url : null,
        destino,
      }));
    } catch {
      return res.redirect(302, destino);
    }
  }

  /** @route GET /share/produtor/:id */
  static async produtor(req, res) {
    const destino = frontUrl(`/produtor/${encodeURIComponent(req.params.id)}`);
    try {
      const { produtor, reputacao } = await ProdutorService.perfil({ id: req.params.id });
      return res.type('html').send(paginaCompartilhamento({
        titulo: `${produtor.nome}${produtor.verificado ? ' ✓' : ''} — AgroMundo`,
        descricao: (produtor.bio || `Produtor de ${produtor.cidade || ''}/${produtor.uf || ''} com ${reputacao.anuncios_ativos} produtos no AgroMundo.`).slice(0, 200),
        imagem: produtor.foto_url,
        destino,
      }));
    } catch {
      return res.redirect(302, destino);
    }
  }
}

module.exports = ShareController;
