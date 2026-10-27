/**
 * Gera os ícones PNG do app instalável (PWA) sem dependências: desenha o
 * broto do AgroMundo (branco) sobre fundo laranja, com antisserrilhamento
 * por supersampling, e codifica PNG com o zlib do Node.
 *
 * Uso: node scripts/gerar-icones.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const LARANJA = [244, 119, 11];
const BRANCO = [255, 255, 255];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tipo, dados) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(tam, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  const linhas = Buffer.alloc((tam * 4 + 1) * tam);
  for (let y = 0; y < tam; y++) {
    linhas[y * (tam * 4 + 1)] = 0;
    pixels.copy(linhas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(linhas)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Folha: elipse girada. (u,v) em coordenadas 0..1 do ícone. */
function dentroFolha(u, v, cx, cy, rx, ry, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const x = (u - cx) * c + (v - cy) * s;
  const y = -(u - cx) * s + (v - cy) * c;
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
}

/** Desenho do broto (escala 0..1, `margem` reduz para a zona segura de ícones maskable). */
function broto(u, v, margem) {
  const k = 1 - 2 * margem;
  u = (u - margem) / k;
  v = (v - margem) / k;
  const caule = Math.abs(u - 0.5) < 0.035 && v > 0.42 && v < 0.82;
  const folhaEsq = dentroFolha(u, v, 0.33, 0.38, 0.2, 0.1, Math.PI / 5);
  const folhaDir = dentroFolha(u, v, 0.67, 0.3, 0.2, 0.1, -Math.PI / 4.2);
  const chao = Math.abs(v - 0.82) < 0.03 && Math.abs(u - 0.5) < 0.22;
  return caule || folhaEsq || folhaDir || chao;
}

function icone(tam, { margem, arredondado }) {
  const px = Buffer.alloc(tam * tam * 4);
  const S = 4; // supersampling 4x4
  const raio = arredondado ? 0.22 : 0;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let fundo = 0;
      let desenho = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / tam;
          const v = (y + (sy + 0.5) / S) / tam;
          // fundo com cantos arredondados (ou quadrado cheio, para maskable)
          const dx = Math.max(raio - u, 0, u - (1 - raio));
          const dy = Math.max(raio - v, 0, v - (1 - raio));
          if (raio === 0 || dx * dx + dy * dy <= raio * raio) {
            fundo++;
            if (broto(u, v, margem)) desenho++;
          }
        }
      }
      const total = S * S;
      const a = fundo / total;
      const t = fundo ? desenho / fundo : 0;
      const i = (y * tam + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(LARANJA[c] * (1 - t) + BRANCO[c] * t);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return png(tam, px);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icone(192, { margem: 0.12, arredondado: true }));
writeFileSync('public/icons/icon-512.png', icone(512, { margem: 0.12, arredondado: true }));
writeFileSync('public/icons/maskable-512.png', icone(512, { margem: 0.22, arredondado: false }));
writeFileSync('public/icons/apple-touch-icon.png', icone(180, { margem: 0.14, arredondado: false }));
console.log('Ícones gerados em public/icons');
