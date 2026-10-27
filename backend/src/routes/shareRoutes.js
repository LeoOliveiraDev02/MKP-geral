/**
 * @file shareRoutes.js
 * @description Páginas de compartilhamento com prévia (Open Graph) para
 * WhatsApp/redes sociais. Quem abre o link é redirecionado para o front;
 * robôs de prévia leem só as meta tags.
 *
 *   GET /share/produto/:id  → prévia do anúncio
 *   GET /share/produtor/:id → prévia da página do produtor
 *
 * Observação: a prévia só aparece quando o link é público (o robô do
 * WhatsApp não acessa localhost).
 */

const express = require('express');
const AnuncioService = require('../services/AnuncioService');
const ProdutorService = require('../services/ProdutorService');

const router = express.Router();

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function frontUrl(caminho) {
  return `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}${caminho}`;
}

function pagina({ titulo, descricao, imagem, destino }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapar(titulo)}</title>
<meta name="description" content="${escapar(descricao)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AgroMundo">
<meta property="og:title" content="${escapar(titulo)}">
<meta property="og:description" content="${escapar(descricao)}">
${imagem ? `<meta property="og:image" content="${escapar(imagem)}">` : ''}
<meta property="og:url" content="${escapar(destino)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${escapar(destino)}">
</head>
<body>
<p>Abrindo <a href="${escapar(destino)}">${escapar(titulo)}</a>…</p>
<script>location.replace(${JSON.stringify(destino)});</script>
</body>
</html>`;
}

const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

router.get('/produto/:id', async (req, res) => {
  const destino = frontUrl(`/produto/${encodeURIComponent(req.params.id)}`);
  try {
    const ad = await AnuncioService.get({ id: req.params.id });
    const principal = ad.imagens.find((i) => i.tipo === 'PRINCIPAL') || ad.imagens[0];
    res.type('html').send(pagina({
      titulo: `${ad.nome} — ${moeda(ad.preco_efetivo)}${ad.unidade !== 'un' ? ` / ${ad.unidade}` : ''}`,
      descricao: `${ad.vendedor.nome} · ${ad.localizacao.cidade}/${ad.localizacao.uf}. ${ad.descricao}`.slice(0, 200),
      imagem: principal ? principal.url : null,
      destino,
    }));
  } catch {
    res.redirect(302, destino);
  }
});

router.get('/produtor/:id', async (req, res) => {
  const destino = frontUrl(`/produtor/${encodeURIComponent(req.params.id)}`);
  try {
    const { produtor, reputacao } = await ProdutorService.perfil({ id: req.params.id });
    res.type('html').send(pagina({
      titulo: `${produtor.nome}${produtor.verificado ? ' ✓' : ''} — AgroMundo`,
      descricao: (produtor.bio || `Produtor de ${produtor.cidade || ''}/${produtor.uf || ''} com ${reputacao.anuncios_ativos} produtos no AgroMundo.`).slice(0, 200),
      imagem: produtor.foto_url,
      destino,
    }));
  } catch {
    res.redirect(302, destino);
  }
});

module.exports = router;
