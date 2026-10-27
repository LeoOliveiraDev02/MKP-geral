/**
 * Configuração do Multer para Upload de Arquivos (multer.js)
 *
 * Este arquivo é responsável por configurar o middleware Multer, que lida com requisições do tipo
 * 'multipart/form-data' (essencialmente upload de arquivos de imagem no backend).
 * Ele define onde as imagens serão salvas, como os nomes dos arquivos serão gerados para evitar
 * colisões, quais tipos de arquivos são permitidos (filtro por Mime Type) e o limite de tamanho.
 *
 * Para um desenvolvedor júnior, imagine o Multer como uma recepcionista na portaria da API.
 * Quando alguém envia uma imagem de produto, o Multer valida se é de fato uma imagem permitida,
 * se o tamanho não ultrapassa o limite e escolhe um "armário" (pasta) com uma "etiqueta" (nome único)
 * para guardar esse arquivo antes que ele chegue ao nosso banco de dados.
 *
 * Segurança:
 * - Nome do arquivo 100% gerado no servidor (bytes aleatórios do CSPRNG); a
 *   extensão vem do tipo permitido, nunca do nome enviado (evita `.html`,
 *   `.svg`, `../`, nomes duplos como `foto.php.jpg`).
 * - O Mime Type declarado pelo cliente não basta: depois de gravar, os
 *   primeiros bytes ("magic bytes") são conferidos. Se não for JPEG/PNG/WEBP
 *   de verdade, todos os arquivos da requisição são apagados e a resposta é 400.
 * - Limites de tamanho, quantidade de arquivos e de campos.
 * - Toda imagem aceita é reprocessada (sharp): sai sem EXIF/GPS, sem bytes
 *   extras e com no máximo 2560 px de lado; decodificação limitada a 40 MP.
 */

// Importação do pacote Multer, um middleware Node.js para manipulação de uploads
const multer = require('multer');
// Módulo nativo para trabalhar com caminhos de arquivos e extensões de forma consistente
const path = require('path');
// Módulo nativo File System para gerenciar e criar diretórios no servidor
const fs = require('fs');
const crypto = require('crypto');

// Diretório de destino (permite override via UPLOAD_DIR — usado pelos testes
// para isolar uploads por arquivo de teste em execuções paralelas).
const uploadDir = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../public/uploads');

// Garante que o diretório de upload exista no disco rígido do servidor.
// Se não existir (ex: primeira inicialização), o fs.mkdirSync o criará recursivamente.
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Tipos aceitos → extensão gravada no disco
const EXTENSOES = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Configuração do motor de armazenamento no disco (diskStorage).
// Controla o destino do arquivo e como ele será nomeado ao ser gravado.
const storage = multer.diskStorage({
  // Define a pasta de destino do upload
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  // Nome imprevisível gerado no servidor + extensão derivada do tipo permitido.
  // Exemplo final: imagem-5f2c9a...e1.jpg
  filename: (req, file, cb) => {
    const aleatorio = crypto.randomBytes(16).toString('hex');
    cb(null, `${file.fieldname}-${aleatorio}${EXTENSOES[file.mimetype]}`);
  }
});

/**
 * Filtro de arquivos (fileFilter).
 * Analisa as propriedades do arquivo enviado e decide se ele deve ser aceito ou rejeitado.
 * Aqui, restringimos apenas a formatos comuns de imagens.
 */
const fileFilter = (req, file, cb) => {
  if (EXTENSOES[file.mimetype]) {
    cb(null, true);
  } else {
    const erro = new Error('Formato de imagem inválido. Apenas JPG, JPEG, PNG e WEBP são permitidos.');
    erro.status = 400;
    erro.expose = true;
    cb(erro, false);
  }
};

/**
 * Instanciação e configuração final do middleware Multer.
 */
const multerBase = multer({
  storage: storage,
  limits: {
    // Limite máximo de tamanho de cada arquivo (10MB, atendendo ao RNF03)
    fileSize: 10 * 1024 * 1024,
    files: 10,
    fields: 60,
    fieldSize: 100 * 1024,
    parts: 80,
  },
  fileFilter: fileFilter
});

/** Confere a assinatura binária real do arquivo (JPEG, PNG ou WEBP). */
function ehImagemReal(caminho) {
  const fd = fs.openSync(caminho, 'r');
  try {
    const b = Buffer.alloc(12);
    const lidos = fs.readSync(fd, b, 0, 12, 0);
    if (lidos < 12) return false;
    const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    return jpeg || png || webp;
  } finally {
    fs.closeSync(fd);
  }
}

function arquivosDaRequisicao(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files) return Object.values(req.files).flat();
  return [];
}

// Teto de pixels decodificados (contra "pixel flood": PNG pequeno que vira
// gigabytes na memória) e lado máximo gravado.
const MAX_PIXELS = 40 * 1000 * 1000;
const LADO_MAXIMO = 2560;

/**
 * Reprocessa a imagem (decodifica e codifica de novo): remove EXIF/GPS e
 * outros metadados (privacidade), descarta bytes "escondidos" após a imagem
 * (polyglots) e reduz fotos enormes. Corrige a orientação pelo EXIF antes.
 */
async function reprocessar(arquivo) {
  const sharp = require('sharp');
  const ext = path.extname(arquivo.path).toLowerCase();
  // Lê para memória: com o caminho, o libvips mantém o arquivo aberto (no
  // Windows a regravação abaixo falharia).
  let img = sharp(fs.readFileSync(arquivo.path), { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true });
  if (ext === '.png') img = img.png({ compressionLevel: 9 });
  else if (ext === '.webp') img = img.webp({ quality: 85 });
  else img = img.jpeg({ quality: 85, mozjpeg: true });
  const buffer = await img.toBuffer();
  fs.writeFileSync(arquivo.path, buffer);
  arquivo.size = buffer.length;
}

function descartar(arquivos) {
  for (const f of arquivos) {
    try { fs.unlinkSync(f.path); } catch { /* já removido */ }
  }
}

/** Middleware pós-Multer: descarta a requisição inteira se algum arquivo não for imagem real. */
async function verificarConteudo(req, res, next) {
  const arquivos = arquivosDaRequisicao(req);
  const invalido = arquivos.some((f) => {
    try {
      return !ehImagemReal(f.path);
    } catch {
      return true;
    }
  });
  if (!invalido) {
    try {
      for (const f of arquivos) await reprocessar(f);
      return next();
    } catch {
      // Arquivo corrompido, com pixels demais ou que o decodificador recusou.
    }
  }
  descartar(arquivos);
  return res.status(400).json({
    status: 'error',
    message: 'O arquivo enviado não é uma imagem válida (JPG, PNG ou WEBP) ou é grande demais.',
  });
}

// Mesma API do Multer (single/array/fields), sempre seguida da verificação de conteúdo.
const upload = {
  single: (campo) => [multerBase.single(campo), verificarConteudo],
  array: (campo, max) => [multerBase.array(campo, max), verificarConteudo],
  fields: (campos) => [multerBase.fields(campos), verificarConteudo],
};

// Exporta o middleware configurado para ser importado e injetado nas rotas que necessitam de upload
module.exports = upload;
