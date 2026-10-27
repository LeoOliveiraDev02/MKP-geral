import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Star, Truck, Store } from 'lucide-react';
import { Product, formatCurrency, UNIDADES } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { AnuncioService } from '../../api/services';
import { anuncioResumoToProduct } from '../../api/mappers';
import { C, FONT } from './theme';

const QUANTIDADE = 12;
const VERDE = '#00A650';

/**
 * Vitrine do topo da página inicial (estilo loja): ofertas vigentes primeiro,
 * completadas pelos anúncios mais bem avaliados.
 */
export function ProdutosDestaque({ onProductClick, onVerTodos }: {
  onProductClick: (product: Product) => void;
  onVerTodos: () => void;
}) {
  const [produtos, setProdutos] = useState<Product[] | null>(null);
  const trilho = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.allSettled([
      AnuncioService.list({ ofertas: true, limit: QUANTIDADE, sort: 'mais_avaliados' }),
      AnuncioService.list({ limit: QUANTIDADE, sort: 'mais_avaliados' }),
    ]).then(([ofertas, avaliados]) => {
      if (cancelado) return;
      const vistos = new Set<string>();
      const lista: Product[] = [];
      for (const r of [ofertas, avaliados]) {
        if (r.status !== 'fulfilled') continue;
        for (const p of r.value.data.map(anuncioResumoToProduct)) {
          if (!vistos.has(p.id) && p.estoque !== 0) { vistos.add(p.id); lista.push(p); }
        }
      }
      setProdutos(lista.slice(0, QUANTIDADE));
    });
    return () => { cancelado = true; };
  }, []);

  const rolar = (direcao: 1 | -1) => {
    const el = trilho.current;
    if (el) el.scrollBy({ left: direcao * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  if (produtos !== null && produtos.length === 0) return null;

  return (
    <section style={{ background: C.bg, fontFamily: FONT }}>
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-end justify-between mb-3">
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: C.text }}>Produtos em destaque</h2>
          <button
            onClick={onVerTodos}
            style={{ background: 'none', border: 'none', color: C.orange, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >
            Ver todos
          </button>
        </div>

        <div className="relative">
          <div
            ref={trilho}
            className="no-scrollbar"
            style={{
              display: 'flex', gap: '12px', overflowX: 'auto', scrollSnapType: 'x mandatory',
              padding: '4px 2px 12px',
            }}
          >
            {produtos === null
              ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ ...cartaoStyle, height: '330px', background: C.surface, cursor: 'default' }} />
              ))
              : produtos.map(p => <CartaoDestaque key={p.id} produto={p} onClick={() => onProductClick(p)} />)}
          </div>

          <SetaRolagem lado="esquerda" onClick={() => rolar(-1)} />
          <SetaRolagem lado="direita" onClick={() => rolar(1)} />
        </div>
      </div>
    </section>
  );
}

function CartaoDestaque({ produto: p, onClick }: { produto: Product; onClick: () => void }) {
  const desconto = p.emOferta && p.price > p.precoEfetivo
    ? Math.round((1 - p.precoEfetivo / p.price) * 100)
    : 0;
  const [reais, centavos] = formatCurrency(p.precoEfetivo).split(',');

  return (
    <button
      onClick={onClick}
      className="hover:shadow-[0_8px_24px_rgba(37,37,34,0.14)]"
      style={{ ...cartaoStyle, background: C.surface, textAlign: 'left', transition: 'box-shadow .2s' }}
    >
      <div style={{ height: '180px', background: '#fff', borderBottom: `1px solid ${C.border}` }}>
        <ImageWithFallback src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div
          style={{
            fontSize: '14px', color: C.text, lineHeight: 1.3, height: '36px', overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}
        >
          {p.name}
        </div>

        <div style={{ fontSize: '12.5px', color: C.muted, textDecoration: 'line-through', minHeight: '16px' }}>
          {desconto > 0 ? formatCurrency(p.price) : ''}
        </div>

        <div className="flex items-baseline flex-wrap" style={{ gap: '6px' }}>
          <span style={{ fontSize: '24px', fontWeight: 500, color: C.text, lineHeight: 1 }}>
            {reais}<sup style={{ fontSize: '12px', marginLeft: '1px' }}>{centavos}</sup>
          </span>
          {desconto > 0 && <span style={{ fontSize: '14px', color: VERDE, fontWeight: 600 }}>{desconto}% OFF</span>}
        </div>
        <div style={{ fontSize: '12px', color: C.muted }}>por {UNIDADES[p.unidade]?.longo ?? p.unidade}</div>

        <div style={{ fontSize: '13px', fontWeight: 600, color: VERDE, display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
          {p.permiteEntrega
            ? <><Truck size={14} /> Entrega disponível</>
            : <><Store size={14} /> Retirada com o produtor</>}
        </div>

        {p.notaMedia !== null && p.totalAvaliacoes > 0 && (
          <div style={{ fontSize: '12px', color: C.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Star size={12} color={C.orange} fill={C.orange} />
            {p.notaMedia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ({p.totalAvaliacoes})
          </div>
        )}
      </div>
    </button>
  );
}

function SetaRolagem({ lado, onClick }: { lado: 'esquerda' | 'direita'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={lado === 'esquerda' ? 'Anteriores' : 'Próximos'}
      className="hidden md:flex"
      style={{
        position: 'absolute', top: '42%', [lado === 'esquerda' ? 'left' : 'right']: '-18px',
        width: '40px', height: '40px', borderRadius: '50%', border: `1px solid ${C.border}`,
        background: C.surface, boxShadow: '0 4px 14px rgba(37,37,34,0.15)', cursor: 'pointer',
        alignItems: 'center', justifyContent: 'center', color: C.text,
      }}
    >
      {lado === 'esquerda' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
    </button>
  );
}

const cartaoStyle: React.CSSProperties = {
  flex: '0 0 auto', width: '200px', scrollSnapAlign: 'start',
  border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden',
  cursor: 'pointer', padding: 0, fontFamily: FONT,
  boxShadow: '0 1px 3px rgba(37,37,34,0.08)',
};
