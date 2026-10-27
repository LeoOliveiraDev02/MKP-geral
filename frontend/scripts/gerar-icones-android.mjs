/**
 * Substitui o ícone e a tela de abertura padrão do Capacitor pelos do
 * AgroMundo no projeto Android (android/app/src/main/res), mantendo os
 * tamanhos de cada densidade. Rodar depois de `npx cap add android`.
 *
 * Uso: node scripts/gerar-icones-android.mjs
 */
import { deflateSync } from 'node:zlib';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RES = 'android/app/src/main/res';
const LARANJA = [244, 119, 11];
const BRANCO = [255, 255, 255];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(tipo, dados) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const linhas = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(linhas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(linhas)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const dims = (arq) => {
  const b = readFileSync(arq);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

function folha(u, v, cx, cy, rx, ry, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const x = (u - cx) * c + (v - cy) * s;
  const y = -(u - cx) * s + (v - cy) * c;
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
}
/** Broto em coordenadas 0..1 do quadrado. */
function broto(u, v) {
  return (Math.abs(u - 0.5) < 0.035 && v > 0.42 && v < 0.82)
    || folha(u, v, 0.33, 0.38, 0.2, 0.1, Math.PI / 5)
    || folha(u, v, 0.67, 0.3, 0.2, 0.1, -Math.PI / 4.2)
    || (Math.abs(v - 0.82) < 0.03 && Math.abs(u - 0.5) < 0.22);
}

/**
 * Desenha numa tela w×h: `forma` (null | 'quadrado' | 'circulo') com o broto
 * ocupando `escala` do menor lado, centralizado.
 */
function desenhar(w, h, { fundo, forma, corForma, escala }) {
  const px = Buffer.alloc(w * h * 4);
  const lado = Math.min(w, h);
  const ox = (w - lado) / 2, oy = (h - lado) / 2;
  const S = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let cobForma = 0, cobBroto = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + 0.5) / S - ox) / lado;
        const v = (y + (sy + 0.5) / S - oy) / lado;
        let dentro = forma === null;
        if (forma === 'quadrado') {
          const r = 0.22;
          const dx = Math.max(r - u, 0, u - (1 - r)), dy = Math.max(r - v, 0, v - (1 - r));
          dentro = u >= 0 && u <= 1 && v >= 0 && v <= 1 && dx * dx + dy * dy <= r * r;
        } else if (forma === 'circulo') {
          dentro = (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25;
        }
        if (dentro) cobForma++;
        const bu = (u - 0.5) / escala + 0.5, bv = (v - 0.5) / escala + 0.5;
        if (bu >= 0 && bu <= 1 && bv >= 0 && bv <= 1 && broto(bu, bv)) cobBroto++;
      }
      const t = S * S;
      const i = (y * w + x) * 4;
      const af = cobForma / t, ab = cobBroto / t;
      // camada base: fundo (opcional) + forma laranja; por cima, o broto branco
      let cor = fundo ? [...fundo] : [0, 0, 0];
      let alfa = fundo ? 1 : 0;
      if (corForma) {
        cor = cor.map((c, k) => c * (1 - af) + corForma[k] * af);
        alfa = alfa + af * (1 - alfa);
      }
      cor = cor.map((c, k) => c * (1 - ab) + BRANCO[k] * ab);
      alfa = alfa + ab * (1 - alfa);
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(alfa ? cor[k] : 0);
      px[i + 3] = Math.round(alfa * 255);
    }
  }
  return png(w, h, px);
}

let total = 0;
for (const pasta of readdirSync(RES)) {
  const dir = join(RES, pasta);
  if (pasta.startsWith('mipmap-') && !pasta.includes('anydpi')) {
    for (const [arq, opts] of [
      ['ic_launcher.png', { forma: 'quadrado', corForma: LARANJA, escala: 0.76 }],
      ['ic_launcher_round.png', { forma: 'circulo', corForma: LARANJA, escala: 0.7 }],
      // ícone adaptativo: só o broto, na zona segura (o fundo laranja vem da cor)
      ['ic_launcher_foreground.png', { forma: null, corForma: null, escala: 0.5 }],
    ]) {
      const caminho = join(dir, arq);
      if (!existsSync(caminho)) continue;
      const [w, h] = dims(caminho);
      writeFileSync(caminho, desenhar(w, h, { fundo: null, ...opts }));
      total++;
    }
  }
  if (pasta.startsWith('drawable')) {
    const caminho = join(dir, 'splash.png');
    if (!existsSync(caminho)) continue;
    const [w, h] = dims(caminho);
    writeFileSync(caminho, desenhar(w, h, { fundo: LARANJA, forma: null, corForma: null, escala: 0.3 }));
    total++;
  }
}

// Cor de fundo do ícone adaptativo
const corXml = join(RES, 'values', 'ic_launcher_background.xml');
if (existsSync(corXml)) {
  writeFileSync(corXml, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#F4770B</color>\n</resources>\n');
}
console.log(`${total} imagens do Android atualizadas.`);
