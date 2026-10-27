import { useState } from 'react';
import { SlidersHorizontal, LocateFixed, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';
import { botaoContorno, botaoSecundario, campo, imagemCover } from './ui';
import { UFS } from './FormFields';
import { lerVistos, limparVistos, type ProdutoVisto } from '../../lib/storage';
import type { Ordenacao } from '../../api/services';

export type Filtros = {
  sort: Ordenacao;
  precoMin: string;
  precoMax: string;
  uf: string;
  zona: '' | 'URBANA' | 'RURAL';
  lat: number | null;
  lng: number | null;
  raio: number;
};

export const FILTROS_PADRAO: Filtros = { sort: 'recentes', precoMin: '', precoMax: '', uf: '', zona: '', lat: null, lng: null, raio: 50 };

/** Lê os filtros da URL (?sort=&precoMin=&precoMax=&uf=&zona=&lat=&lng=&raio=). */
export function filtrosDaUrl(params: URLSearchParams): Filtros {
  const num = (k: string) => (params.get(k) !== null && params.get(k) !== '' ? Number(params.get(k)) : null);
  const sort = params.get('sort') as Ordenacao | null;
  const zona = params.get('zona');
  return {
    sort: sort && ['recentes', 'menor_preco', 'maior_preco', 'mais_avaliados', 'proximos'].includes(sort) ? sort : 'recentes',
    precoMin: params.get('precoMin') ?? '',
    precoMax: params.get('precoMax') ?? '',
    uf: params.get('uf') ?? '',
    zona: zona === 'URBANA' || zona === 'RURAL' ? zona : '',
    lat: num('lat'),
    lng: num('lng'),
    raio: num('raio') ?? 50,
  };
}

/** Escreve os filtros na URL preservando busca e categoria. */
export function aplicarFiltrosNaUrl(params: URLSearchParams, f: Filtros): URLSearchParams {
  const novo = new URLSearchParams(params);
  const definir = (k: string, v: string | number | null) => {
    if (v === null || v === '' || (k === 'sort' && v === 'recentes')) novo.delete(k);
    else novo.set(k, String(v));
  };
  definir('sort', f.sort);
  definir('precoMin', f.precoMin);
  definir('precoMax', f.precoMax);
  definir('uf', f.uf);
  definir('zona', f.zona);
  definir('lat', f.lat !== null ? Number(f.lat.toFixed(4)) : null);
  definir('lng', f.lng !== null ? Number(f.lng.toFixed(4)) : null);
  definir('raio', f.lat !== null ? f.raio : null);
  return novo;
}

export function filtrosAtivos(f: Filtros): number {
  return [f.precoMin, f.precoMax, f.uf, f.zona, f.lat !== null ? 'x' : ''].filter(Boolean).length;
}

/** Barra de ordenação + filtros (preço, estado, zona, perto de mim). */
export function BarraFiltros({ filtros, onChange }: { filtros: Filtros; onChange: (f: Filtros) => void }) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState(filtros);
  const [localizando, setLocalizando] = useState(false);
  const ativos = filtrosAtivos(filtros);

  const pertoDeMim = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Seu navegador não informa a localização.');
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocalizando(false);
        onChange({ ...filtros, lat: pos.coords.latitude, lng: pos.coords.longitude, sort: 'proximos' });
      },
      () => {
        setLocalizando(false);
        toast.error('Não foi possível obter sua localização. Verifique a permissão do navegador.');
      },
      { timeout: 10000 }
    );
  };

  return (
    <div style={{ fontFamily: FONT, marginBottom: '16px' }}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2" style={{ fontSize: '13px', color: C.muted }}>
          Ordenar por
          <select
            value={filtros.sort}
            onChange={e => onChange({ ...filtros, sort: e.target.value as Ordenacao })}
            style={{ ...campo, width: 'auto', padding: '8px 10px' }}
          >
            <option value="recentes">Mais recentes</option>
            <option value="menor_preco">Menor preço</option>
            <option value="maior_preco">Maior preço</option>
            <option value="mais_avaliados">Mais bem avaliados</option>
            {filtros.lat !== null && <option value="proximos">Mais perto de mim</option>}
          </select>
        </label>
        <button onClick={() => { setRascunho(filtros); setAberto(v => !v); }} style={{ ...botaoSecundario, borderColor: ativos ? C.orange : C.border }}>
          <SlidersHorizontal size={15} /> Filtros{ativos ? ` (${ativos})` : ''}
        </button>
        {filtros.lat === null ? (
          <button onClick={pertoDeMim} disabled={localizando} style={botaoContorno}>
            <LocateFixed size={15} /> {localizando ? 'Localizando...' : 'Perto de mim'}
          </button>
        ) : (
          <span className="flex items-center gap-2" style={{ ...botaoContorno, cursor: 'default' }}>
            <LocateFixed size={15} /> até
            <select value={filtros.raio} onChange={e => onChange({ ...filtros, raio: Number(e.target.value) })} aria-label="Raio"
              style={{ border: 'none', background: 'transparent', color: C.orange, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
              {[10, 25, 50, 100, 300].map(r => <option key={r} value={r}>{r} km</option>)}
            </select>
            <button onClick={() => onChange({ ...filtros, lat: null, lng: null, sort: filtros.sort === 'proximos' ? 'recentes' : filtros.sort })}
              aria-label="Remover filtro de distância" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.orange, display: 'flex' }}>
              <X size={15} />
            </button>
          </span>
        )}
        {ativos > 0 && (
          <button onClick={() => onChange({ ...FILTROS_PADRAO, sort: filtros.sort === 'proximos' ? 'recentes' : filtros.sort })}
            style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '13px', fontFamily: FONT }}>
            Limpar filtros
          </button>
        )}
      </div>

      {aberto && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 items-end"
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px' }}>
          <label style={{ fontSize: '12.5px', color: C.muted }}>
            Preço mínimo (R$)
            <input type="number" min={0} value={rascunho.precoMin} onChange={e => setRascunho({ ...rascunho, precoMin: e.target.value })} style={{ ...campo, marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '12.5px', color: C.muted }}>
            Preço máximo (R$)
            <input type="number" min={0} value={rascunho.precoMax} onChange={e => setRascunho({ ...rascunho, precoMax: e.target.value })} style={{ ...campo, marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '12.5px', color: C.muted }}>
            Estado
            <select value={rascunho.uf} onChange={e => setRascunho({ ...rascunho, uf: e.target.value })} style={{ ...campo, marginTop: '4px' }}>
              <option value="">Todos</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '12.5px', color: C.muted }}>
            Zona de produção
            <select value={rascunho.zona} onChange={e => setRascunho({ ...rascunho, zona: e.target.value as Filtros['zona'] })} style={{ ...campo, marginTop: '4px' }}>
              <option value="">Rural e urbana</option>
              <option value="RURAL">Rural</option>
              <option value="URBANA">Urbana</option>
            </select>
          </label>
          <button onClick={() => { onChange(rascunho); setAberto(false); }} style={{ ...botaoContorno, height: '41px' }}>Aplicar</button>
        </div>
      )}
    </div>
  );
}

/** Faixa "Vistos recentemente" (salva no navegador). */
export function VistosRecentemente({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [vistos, setVistos] = useState<ProdutoVisto[]>(() => lerVistos());
  if (vistos.length === 0) return null;
  return (
    <section style={{ marginBottom: '36px', fontFamily: FONT }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2" style={{ fontSize: '20px', fontWeight: 700, color: C.text }}>
          <Clock size={19} color={C.brown} /> Vistos recentemente
        </h2>
        <button onClick={() => { limparVistos(); setVistos([]); }} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '13px', fontFamily: FONT }}>
          Limpar histórico
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {vistos.map(v => (
          <button key={v.id} onClick={() => onAbrir(v.id)}
            style={{ flex: '0 0 160px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
            <div style={{ height: '100px', background: C.border }}>
              <ImageWithFallback src={v.image} alt={v.name} style={imagemCover} />
            </div>
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: C.orange }}>{formatCurrency(v.precoEfetivo ?? v.price)}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
