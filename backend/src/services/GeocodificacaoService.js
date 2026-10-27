/**
 * @file GeocodificacaoService.js
 * @description Converte endereços em coordenadas (latitude/longitude) para o
 * "perto de mim" e o mapa de produtores.
 *
 * - Provedor: Nominatim (OpenStreetMap), gratuito, limite de 1 req/s e
 *   User-Agent obrigatório. Ative com `GEOCODER=nominatim` no .env.
 * - Sem GEOCODER (ex: testes), não faz chamadas de rede: o endereço só fica
 *   sem coordenadas e não aparece nas buscas por distância.
 * - Roda fora da requisição (fire-and-forget): falha de rede nunca impede
 *   salvar o endereço.
 */

const { eq, and, isNull } = require('drizzle-orm');
const { getDb } = require('../db');
const { enderecos } = require('../db/schema');
const { runAsSystem } = require('../db/context');
const logger = require('../utils/logger');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
let fila = Promise.resolve();

function ativo() {
  return (process.env.GEOCODER || '').toLowerCase() === 'nominatim';
}

async function consultar(params) {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'br', ...params })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': process.env.GEOCODER_USER_AGENT || 'AgroMundo/1.0 (ambiente de teste)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
  const [hit] = await res.json();
  return hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon) } : null;
}

/** Tenta rua+cidade; se não achar, usa o centro da cidade. */
async function geocodificar({ rua, numero, cidade, uf, cep }) {
  const porRua = await consultar({ street: `${numero || ''} ${rua || ''}`.trim(), city: cidade, state: uf, postalcode: cep || '' });
  if (porRua) return porRua;
  await new Promise((r) => setTimeout(r, 1100));
  return consultar({ city: cidade, state: uf });
}

class GeocodificacaoService {
  /**
   * Agenda a geocodificação do endereço `id` (serializada: 1 req/s).
   * Retorna a promessa da fila (útil em scripts), mas quem chama não precisa aguardar.
   */
  static agendar(id, endereco) {
    if (!ativo()) return Promise.resolve(null);
    fila = fila
      .then(async () => {
        const coords = await geocodificar(endereco);
        if (coords) {
          await runAsSystem(() => getDb().update(enderecos).set(coords).where(eq(enderecos.id, Number(id))));
        }
        await new Promise((r) => setTimeout(r, 1100));
        return coords;
      })
      .catch((err) => {
        logger.warn('Falha ao geocodificar endereço', { enderecoId: Number(id), erro: err.message });
        return null;
      });
    return fila;
  }

  /** Agenda todos os endereços do usuário ainda sem coordenadas (após cadastro/edição). */
  static async agendarPendentes(usuarioId) {
    if (!ativo()) return;
    const pendentes = await runAsSystem(() =>
      getDb()
        .select()
        .from(enderecos)
        .where(and(eq(enderecos.clienteId, Number(usuarioId)), isNull(enderecos.latitude)))
    );
    for (const e of pendentes) GeocodificacaoService.agendar(e.id, e);
  }

  /** Geocodifica todos os endereços sem coordenadas (script `npm run db:geocode`). */
  static async geocodificarTodosPendentes() {
    const pendentes = await runAsSystem(() =>
      getDb().select().from(enderecos).where(isNull(enderecos.latitude))
    );
    let feitos = 0;
    for (const e of pendentes) {
      if (await GeocodificacaoService.agendar(e.id, e)) feitos += 1;
    }
    return { pendentes: pendentes.length, geocodificados: feitos };
  }
}

module.exports = GeocodificacaoService;
