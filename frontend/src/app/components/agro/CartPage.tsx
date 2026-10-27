import { useEffect, useState } from 'react';
import { ShoppingCart, Trash2, ArrowRight, Store, Truck, AlertTriangle, Minus, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CartItem, formatCurrency, UNIDADES } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';
import { Card, EmptyState, PageShell, botaoPrimario, botaoSecundario, desabilitado, imagemCover } from './ui';
import { useApp } from '../../AppContext';
import { PedidoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { GrupoCarrinho } from '../../api/types';

type CartPageProps = {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onBack: () => void;
};

/**
 * Carrinho salvo no navegador. Preços (oferta e atacado) e estoque são
 * conferidos no servidor a cada mudança; o frete é escolhido no checkout.
 */
export function CartPage({ items, onUpdateQuantity, onRemove, onBack }: CartPageProps) {
  const app = useApp();
  const [grupos, setGrupos] = useState<GrupoCarrinho[] | null>(null);
  const [freteGratisAcima, setFreteGratisAcima] = useState(500);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const chave = items.map(i => `${i.product.id}:${i.quantity}`).join(',');

  useEffect(() => {
    if (items.length === 0) {
      setGrupos([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    const t = setTimeout(() => {
      PedidoService.cotar(items.map(i => ({ anuncioId: Number(i.product.id), quantidade: i.quantity })))
        .then(r => {
          if (cancelado) return;
          setGrupos(r.grupos);
          setFreteGratisAcima(r.frete_gratis_acima);
          setErro(null);
        })
        .catch(err => { if (!cancelado) { setErro(getErrorMessage(err)); setGrupos(null); } })
        .finally(() => { if (!cancelado) setCarregando(false); });
    }, 250);
    return () => { cancelado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  if (items.length === 0) {
    return (
      <PageShell titulo="Meu carrinho" onVoltar={onBack}>
        <EmptyState
          icone={<ShoppingCart size={44} />}
          titulo="Seu carrinho está vazio"
          texto="Explore os produtos frescos dos produtores da sua região."
          acao={{ rotulo: 'Ver produtos', onClick: () => app.go('/') }}
        />
      </PageShell>
    );
  }

  // Preço unitário confirmado pelo servidor (atacado/oferta) ou o da vitrine enquanto carrega
  const precoConfirmado = (id: string) => {
    for (const g of grupos ?? []) {
      const item = g.itens.find(i => String(i.anuncio_id) === id);
      if (item) return item.preco_unitario;
    }
    return null;
  };

  const subtotal = grupos
    ? grupos.reduce((acc, g) => acc + g.subtotal, 0)
    : items.reduce((acc, i) => acc + i.product.precoEfetivo * i.quantity, 0);

  const porVendedor = new Map<string, CartItem[]>();
  for (const item of items) {
    const chaveV = item.product.anuncianteId || item.product.producer;
    if (!porVendedor.has(chaveV)) porVendedor.set(chaveV, []);
    porVendedor.get(chaveV)!.push(item);
  }

  const irParaCheckout = () => {
    if (!app.user) app.pedirLogin('/checkout');
    else app.go('/checkout');
  };

  return (
    <PageShell
      titulo="Meu carrinho"
      subtitulo={`${app.carrinho.totalItens} ${app.carrinho.totalItens === 1 ? 'item' : 'itens'} de ${porVendedor.size} ${porVendedor.size === 1 ? 'produtor' : 'produtores'}`}
      onVoltar={onBack}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="flex flex-col gap-4">
          {erro && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#FBE7E7', border: '1px solid rgba(214,69,69,0.3)', borderRadius: '12px', padding: '12px 14px', color: '#9B2C2C', fontSize: '14px' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{erro} Ajuste a quantidade ou remova o item para continuar.</span>
            </div>
          )}

          {[...porVendedor.entries()].map(([chaveV, itens]) => (
            <Card key={chaveV} padding="0">
              <div className="flex items-center gap-2" style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '14px' }}>
                <Store size={16} color={C.brown} />
                <button
                  onClick={() => app.go(`/produtor/${itens[0].product.anuncianteId}`)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, color: C.text, fontFamily: FONT }}
                >
                  {itens[0].product.producer}
                </button>
                <span style={{ color: C.muted }}>· {itens[0].product.location}</span>
              </div>
              <AnimatePresence initial={false}>
                {itens.map(item => {
                  const unitario = precoConfirmado(item.product.id) ?? item.product.precoEfetivo;
                  const atacado = unitario < item.product.precoEfetivo;
                  const limite = item.product.estoque ?? 999;
                  return (
                    <motion.div
                      key={item.product.id}
                      layout
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-4"
                      style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}
                    >
                      <button
                        onClick={() => app.go(`/produto/${item.product.id}`)}
                        style={{ width: '76px', height: '76px', borderRadius: '10px', overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, background: C.border }}
                      >
                        <ImageWithFallback src={item.product.image} alt={item.product.name} style={imagemCover} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div style={{ fontSize: '12px', color: C.brown, fontWeight: 600 }}>{item.product.category}</div>
                        <div style={{ fontSize: '15px', fontWeight: 600 }}>{item.product.name}</div>
                        <div style={{ fontSize: '13px', color: C.muted, marginTop: '2px' }}>
                          {formatCurrency(unitario)} / {UNIDADES[item.product.unidade]?.curto ?? 'un'}
                          {atacado && <span style={{ color: C.success, fontWeight: 600 }}> · preço de atacado</span>}
                          {item.product.estoque !== null && <span> · {item.product.estoque} em estoque</span>}
                        </div>
                      </div>
                      <div className="flex items-center" style={{ border: `1px solid ${C.border}`, borderRadius: '10px', height: '40px' }}>
                        <button aria-label="Diminuir" onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)} style={qtdBtn}>
                          <Minus size={15} />
                        </button>
                        <span style={{ width: '34px', textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
                        <button
                          aria-label="Aumentar"
                          disabled={item.quantity >= limite}
                          onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                          style={{ ...qtdBtn, opacity: item.quantity >= limite ? 0.35 : 1 }}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <div style={{ minWidth: '96px', textAlign: 'right', fontWeight: 700, color: C.orange }}>
                        {formatCurrency(unitario * item.quantity)}
                      </div>
                      <button onClick={() => onRemove(item.product.id)} aria-label="Remover do carrinho" style={{ ...botaoSecundario, padding: '8px', color: C.danger }}>
                        <Trash2 size={16} />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </Card>
          ))}
        </div>

        <Card style={{ position: 'sticky', top: '72px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>Resumo</h2>
          <div className="flex justify-between" style={{ fontSize: '14px', marginBottom: '8px' }}>
            <span style={{ color: C.muted }}>Produtos</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between" style={{ fontSize: '14px', marginBottom: '14px' }}>
            <span style={{ color: C.muted }}>Frete</span>
            <span style={{ color: C.muted }}>calculado no checkout</span>
          </div>
          <div className="flex gap-2" style={{ background: '#FBFAF7', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', color: '#4A4A45', marginBottom: '16px' }}>
            <Truck size={16} color={C.brown} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              Cada produtor gera um pedido separado. Frete grátis quando a compra de um produtor passa de {formatCurrency(freteGratisAcima)}; retirada no local é sempre grátis.
            </span>
          </div>
          <button
            onClick={irParaCheckout}
            disabled={!!erro || carregando}
            style={{ ...desabilitado(botaoPrimario, !!erro || carregando), width: '100%', height: '48px' }}
          >
            {carregando ? 'Conferindo preços...' : 'Finalizar compra'} <ArrowRight size={18} />
          </button>
          <button onClick={() => app.go('/')} style={{ ...botaoSecundario, width: '100%', marginTop: '10px' }}>
            Continuar comprando
          </button>
        </Card>
      </div>
    </PageShell>
  );
}

const qtdBtn: React.CSSProperties = {
  width: '36px', height: '100%', border: 'none', background: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.graphite,
};
