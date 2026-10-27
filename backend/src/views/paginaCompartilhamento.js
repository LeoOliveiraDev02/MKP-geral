/**
 * @file paginaCompartilhamento.js
 * @description View (HTML) da prévia de compartilhamento (Open Graph) para
 * WhatsApp/redes sociais. Quem abre o link é redirecionado para o front;
 * robôs de prévia leem só as meta tags. Todo texto vindo do banco é escapado.
 */

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function paginaCompartilhamento({ titulo, descricao, imagem, destino }) {
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

module.exports = { paginaCompartilhamento };
