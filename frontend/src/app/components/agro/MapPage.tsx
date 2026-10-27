import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, Store } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from './data';
import { C, FONT } from './theme';
import { Card, EmptyState, PageShell, SeloVerificado, botaoContorno, botaoSecundario } from './ui';
import { useApp } from '../../AppContext';
import { AnuncioService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { AnuncioResumoVenda } from '../../api/types';

type Ponto = {
  vendedorId: number;
  nome: string;
  cidade: string;
  uf: string;
  lat: number;
  lng: number;
  verificado: boolean;
  produtos: AnuncioResumoVenda[];
  distancia: number | null;
};

const CENTRO_BRASIL: L.LatLngTuple = [-15.8, -47.9];
const RAIOS = [10, 25, 50, 100, 300];

const pino = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${C.orange};transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -28],
});

const voce = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function escapar(t: string) {
  return t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Mapa (OpenStreetMap) com os produtores que têm endereço geolocalizado. */
export function MapPage() {
  const app = useApp();
  const mapaRef = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const [anuncios, setAnuncios] = useState<AnuncioResumoVenda[] | null>(null);
  const [posicao, setPosicao] = useState<{ lat: number; lng: number } | null>(null);
  const [raio, setRaio] = useState(50);
  const [localizando, setLocalizando] = useState(false);

  // Anúncios com coordenadas (com posição: dentro do raio, mais perto primeiro)
  useEffect(() => {
    setAnuncios(null);
    AnuncioService.list(posicao
      ? { limit: 50, lat: posicao.lat, lng: posicao.lng, raioKm: raio, sort: 'proximos' }
      : { limit: 50 })
      .then(r => setAnuncios(r.data.filter(a => a.latitude !== null && a.longitude !== null)))
      .catch(err => toast.error(getErrorMessage(err)));
  }, [posicao, raio]);

  const pontos: Ponto[] = useMemo(() => {
    const porVendedor = new Map<number, Ponto>();
    for (const a of anuncios ?? []) {
      const p = porVendedor.get(a.anunciante_id);
      if (p) {
        p.produtos.push(a);
        continue;
      }
      porVendedor.set(a.anunciante_id, {
        vendedorId: a.anunciante_id,
        nome: `${a.vendedor_nome} ${a.vendedor_sobrenome}`,
        cidade: a.cidade,
        uf: a.uf,
        lat: a.latitude!,
        lng: a.longitude!,
        verificado: a.vendedor_verificado,
        produtos: [a],
        distancia: a.distancia_km,
      });
    }
    return [...porVendedor.values()];
  }, [anuncios]);

  // Cria o mapa uma vez
  useEffect(() => {
    if (!mapaRef.current || mapa.current) return;
    mapa.current = L.map(mapaRef.current, { scrollWheelZoom: false }).setView(CENTRO_BRASIL, 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa.current);
    camada.current = L.layerGroup().addTo(mapa.current);
    // A página entra com animação: recalcula o tamanho quando ela termina (e ao redimensionar)
    const recalcular = () => mapa.current?.invalidateSize();
    const t = setTimeout(recalcular, 450);
    const observador = new ResizeObserver(recalcular);
    observador.observe(mapaRef.current);
    return () => {
      clearTimeout(t);
      observador.disconnect();
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

  // Desenha marcadores
  useEffect(() => {
    const m = mapa.current;
    const grupo = camada.current;
    if (!m || !grupo) return;
    grupo.clearLayers();
    const limites: L.LatLngTuple[] = [];
    for (const p of pontos) {
      const lista = p.produtos.slice(0, 4).map(a => `<li>${escapar(a.nome)} · <strong>${formatCurrency(a.preco_efetivo)}</strong></li>`).join('');
      const marcador = L.marker([p.lat, p.lng], { icon: pino }).bindPopup(
        `<div style="font-family:Inter,sans-serif;min-width:200px">
          <strong style="font-size:14px">${escapar(p.nome)}</strong>${p.verificado ? ' <span style="color:#2E9E5B">✓ verificado</span>' : ''}
          <div style="color:#727272;font-size:12px">${escapar(p.cidade)}/${escapar(p.uf)}${p.distancia !== null ? ` · ${p.distancia.toLocaleString('pt-BR')} km` : ''}</div>
          <ul style="margin:6px 0;padding-left:16px;font-size:12.5px">${lista}</ul>
          <a href="/produtor/${p.vendedorId}" data-produtor="${p.vendedorId}" style="color:${C.orange};font-weight:600">Ver produtor →</a>
        </div>`
      );
      marcador.addTo(grupo);
      limites.push([p.lat, p.lng]);
    }
    if (posicao) {
      L.marker([posicao.lat, posicao.lng], { icon: voce }).bindTooltip('Você está aqui').addTo(grupo);
      L.circle([posicao.lat, posicao.lng], { radius: raio * 1000, color: C.orange, weight: 1, fillOpacity: 0.05 }).addTo(grupo);
      limites.push([posicao.lat, posicao.lng]);
    }
    if (limites.length === 1) m.setView(limites[0], 11);
    else if (limites.length > 1) m.fitBounds(limites, { padding: [40, 40], maxZoom: 12 });
  }, [pontos, posicao, raio]);

  // Links do popup navegam pelo app (sem recarregar a página)
  useEffect(() => {
    const el = mapaRef.current;
    if (!el) return;
    const aoClicar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement).closest('a[data-produtor]') as HTMLAnchorElement | null;
      if (alvo) {
        e.preventDefault();
        app.go(`/produtor/${alvo.dataset.produtor}`);
      }
    };
    el.addEventListener('click', aoClicar);
    return () => el.removeEventListener('click', aoClicar);
  }, [app]);

  const localizar = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Seu navegador não informa a localização.');
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPosicao({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocalizando(false);
      },
      () => {
        toast.error('Não foi possível obter sua localização. Verifique a permissão do navegador.');
        setLocalizando(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  return (
    <PageShell
      titulo="Mapa de produtores"
      subtitulo="Encontre quem produz perto de você. Só aparecem produtores com endereço localizado no mapa."
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={localizar} disabled={localizando} style={botaoContorno}>
            <LocateFixed size={16} /> {localizando ? 'Localizando...' : posicao ? 'Atualizar minha posição' : 'Perto de mim'}
          </button>
          {posicao && (
            <>
              <select value={raio} onChange={e => setRaio(Number(e.target.value))} aria-label="Raio" style={{ ...botaoSecundario, padding: '9px 10px' }}>
                {RAIOS.map(r => <option key={r} value={r}>até {r} km</option>)}
              </select>
              <button onClick={() => setPosicao(null)} style={botaoSecundario}>Ver todos</button>
            </>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div ref={mapaRef} style={{ height: 'min(70vh, 620px)', borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border}`, zIndex: 0 }} />
        <div className="flex flex-col gap-3" style={{ maxHeight: 'min(70vh, 620px)', overflowY: 'auto' }}>
          {anuncios === null ? <p style={{ color: C.muted }}>Carregando...</p> : pontos.length === 0 ? (
            <EmptyState icone={<MapPin size={36} />} titulo={posicao ? `Nenhum produtor até ${raio} km` : 'Nenhum produtor no mapa ainda'}
              texto={posicao ? 'Aumente o raio da busca.' : 'Os endereços são localizados automaticamente quando cadastrados.'} />
          ) : pontos.map(p => (
            <Card key={p.vendedorId} padding="14px">
              <button
                onClick={() => {
                  mapa.current?.setView([p.lat, p.lng], 13);
                  mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: FONT, color: C.text, width: '100%' }}
              >
                <div className="flex items-center gap-2" style={{ fontWeight: 700 }}>
                  <Store size={16} color={C.brown} /> {p.nome}
                </div>
                <div style={{ fontSize: '12.5px', color: C.muted }}>
                  {p.cidade}/{p.uf}{p.distancia !== null ? ` · ${p.distancia.toLocaleString('pt-BR')} km de você` : ''} · {p.produtos.length} produto{p.produtos.length > 1 ? 's' : ''}
                </div>
                {p.verificado && <SeloVerificado />}
              </button>
              <button onClick={() => app.go(`/produtor/${p.vendedorId}`)} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 600, cursor: 'pointer', fontSize: '13px', padding: 0, marginTop: '6px', fontFamily: FONT }}>
                Ver produtos →
              </button>
            </Card>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
