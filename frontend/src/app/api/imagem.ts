/**
 * Reduz as fotos antes do upload.
 *
 * Fotos de celular passam fácil de 5 MB e a hospedagem (Vercel) recusa
 * requisições acima de ~4,5 MB. Aqui cada imagem é redimensionada no próprio
 * aparelho (lado máximo de 1600 px) e regravada em JPEG — o backend continua
 * conferindo e reprocessando tudo do mesmo jeito.
 */

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;
/** Imagens pequenas já prontas são enviadas como estão. */
const TAMANHO_OK = 600 * 1024;
/** Teto do corpo da requisição na Vercel (4,5 MB) com folga para os campos. */
export const LIMITE_ENVIO = 4.3 * 1024 * 1024;

async function reduzir(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith('image/') || typeof createImageBitmap !== 'function') return arquivo;

  let bitmap: ImageBitmap;
  try {
    // from-image: aplica a rotação do EXIF (foto "deitada" do celular)
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    return arquivo; // formato que o navegador não decodifica: o backend decide
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && arquivo.size <= TAMANHO_OK) {
    bitmap.close();
    return arquivo;
  }

  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return arquivo;
  }
  // Fundo branco: PNG com transparência não fica preto ao virar JPEG
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE));
  if (!blob || blob.size >= arquivo.size) return arquivo;

  const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], nome, { type: 'image/jpeg', lastModified: arquivo.lastModified });
}

/** Devolve um FormData novo com as imagens reduzidas e o tamanho total do envio. */
export async function reduzirImagensDoForm(form: FormData): Promise<{ form: FormData; tamanho: number }> {
  const novo = new FormData();
  let tamanho = 0;
  for (const [campo, valor] of form.entries()) {
    if (valor instanceof File) {
      const arquivo = await reduzir(valor);
      tamanho += arquivo.size;
      novo.append(campo, arquivo, arquivo.name);
    } else {
      tamanho += valor.length;
      novo.append(campo, valor);
    }
  }
  return { form: novo, tamanho };
}
