import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowRight, Wheat } from 'lucide-react';
import { motion } from 'motion/react';
import { PROMO_BANNERS, Product, Category } from './data';
import { ProductCard } from './ProductCard';
import { ProdutosDestaque } from './ProdutosDestaque';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { AnuncioService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { anuncioResumoToProduct } from '../../api/mappers';
import { C, FONT } from './theme';
import { BarraFiltros, VistosRecentemente, aplicarFiltrosNaUrl, filtrosDaUrl, type Filtros } from './VitrineFiltros';

const PAGE_SIZE = 12;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type HomePageProps = {
  categories: Category[];
  favorites: string[];
  onFavorite: (id: string) => void;
  onAddToCart: (product: Product) => void;
  onProductClick: (product: Product) => void;
  searchQuery: string;
  activeCategory: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  onStartSelling: () => void;
  /** Página /ofertas: só anúncios com promoção vigente, sem o banner da vitrine. */
  somenteOfertas?: boolean;
};

export function HomePage({
  categories, favorites, onFavorite, onAddToCart, onProductClick,
  searchQuery, activeCategory, onCategoryChange, onStartSelling, somenteOfertas = false,
}: HomePageProps) {
  const [params, setParams] = useSearchParams();
  const filtros = filtrosDaUrl(params);
  const chaveFiltros = JSON.stringify(filtros);
  const mostrarVitrine = !somenteOfertas;
  const mudarFiltros = (f: Filtros) => setParams(aplicarFiltrosNaUrl(params, f), { replace: true });
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // GET /ads — refaz a busca do zero quando o filtro muda; `page` > 1 acumula ("Carregar mais").
  useEffect(() => {
    setPage(1);
    setProducts([]);
  }, [searchQuery, activeCategory, chaveFiltros, somenteOfertas]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const numero = (v: string) => (v === '' ? null : Number(v));
    AnuncioService.list({
      page,
      limit: PAGE_SIZE,
      search: searchQuery || null,
      categoriaId: activeCategory ? Number(activeCategory) : null,
      ofertas: somenteOfertas,
      sort: filtros.sort,
      precoMin: numero(filtros.precoMin),
      precoMax: numero(filtros.precoMax),
      uf: filtros.uf || null,
      zona: filtros.zona || null,
      lat: filtros.lat,
      lng: filtros.lng,
      raioKm: filtros.lat !== null ? filtros.raio : null,
    })
      .then(result => {
        if (cancelled) return;
        const mapped = result.data.map(anuncioResumoToProduct);
        setProducts(prev => (page === 1 ? mapped : [...prev, ...mapped]));
        setTotal(result.pagination.total);
        setPages(result.pagination.pages);
      })
      .catch(err => { if (!cancelled) setError(getErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery, activeCategory, reloadKey, chaveFiltros, somenteOfertas]);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>

      {mostrarVitrine && (<>
      <ProdutosDestaque
        onProductClick={onProductClick}
        onVerTodos={() => document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' })}
      />
      </>)}

      {somenteOfertas && (
        <section style={{ background: C.graphite, color: '#fff' }}>
          <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 800 }}>
              Ofertas <span style={{ color: C.orange }}>do campo</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.75)', marginTop: '6px' }}>
              Produtos com preço promocional definido pelos produtores, por tempo limitado.
            </p>
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">

        {mostrarVitrine && !searchQuery && !activeCategory && (
          <VistosRecentemente onAbrir={id => onProductClick({ id } as Product)} />
        )}

        {/* Categories section */}
        {mostrarVitrine && (
        <section style={{ marginBottom: '40px' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 style={{ fontFamily: FONT, fontSize: '22px', fontWeight: 700, color: C.text }}>
              Categorias
            </h2>
            <button onClick={() => onCategoryChange(null)} style={{
              background: 'none', border: 'none', color: C.orange,
              fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              Ver todas <ArrowRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {categories.map((cat, i) => (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onCategoryChange(activeCategory === cat.id ? null : cat.id)}
                style={{
                  background: activeCategory === cat.id
                    ? C.orangeSoft
                    : C.surface,
                  border: `1px solid ${activeCategory === cat.id ? C.orange : C.border}`,
                  borderRadius: '14px', padding: '12px 6px',
                  cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                }}
              >
                <cat.icon size={24} color={cat.color} />
                <span style={{
                  fontSize: '12px', color: activeCategory === cat.id ? C.orange : 'rgba(37,37,34,0.6)',
                  lineHeight: 1.2, fontWeight: 500,
                }}>
                  {cat.name}
                </span>
              </motion.button>
            ))}
          </div>
        </section>
        )}

        {/* Promo banners */}
        {mostrarVitrine && !searchQuery && !activeCategory && (
          <section style={{ marginBottom: '40px' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PROMO_BANNERS.map((banner, i) => (
                <motion.div
                  key={banner.id}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -24 : 24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                  whileHover="hover"
                  style={{
                    position: 'relative',
                    height: '160px',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid rgba(244,119,11,0.15)',
                  }}
                >
                  <motion.div
                    variants={{ hover: { scale: 1.06 } }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <ImageWithFallback
                      src={banner.image}
                      alt={banner.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </motion.div>
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to right, rgba(20,18,14,0.9) 40%, rgba(20,18,14,0.3) 100%)',
                  }} />
                  <div style={{
                    position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)',
                  }}>
                    <div style={{
                      background: 'rgba(244,119,11,0.15)',
                      border: '1px solid rgba(244,119,11,0.3)',
                      borderRadius: '6px', padding: '2px 10px', marginBottom: '8px',
                      fontSize: '10px', color: C.orange, fontWeight: 700, letterSpacing: '1px',
                      display: 'inline-block',
                    }}>
                      {banner.tag}
                    </div>
                    <h3 style={{
                      fontFamily: FONT,
                      fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '4px',
                    }}>
                      {banner.title}
                    </h3>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', maxWidth: '200px' }}>
                      {banner.subtitle}
                    </p>
                  </div>
                  <button style={{
                    position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                    background: '#F4770B',
                    border: 'none', borderRadius: '10px',
                    padding: '8px 16px', color: '#fff',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}>
                    Ver Ofertas
                  </button>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* All products / filtered — GET /ads */}
        <section id="produtos">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 style={{ fontFamily: FONT, fontSize: '22px', fontWeight: 700, color: C.text, marginBottom: '2px' }}>
                {somenteOfertas
                  ? 'Em oferta agora'
                  : searchQuery
                  ? `Resultados para "${searchQuery}"`
                  : activeCategory
                  ? categories.find(c => c.id === activeCategory)?.name || 'Produtos'
                  : 'Anúncios Recentes'}
              </h2>
              <p style={{ fontSize: '13px', color: '#727272' }}>
                {total} produto{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
              </p>
            </div>
            {(searchQuery || activeCategory) && (
              <button
                onClick={() => onCategoryChange(null)}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px', padding: '6px 14px',
                  color: C.danger, fontSize: '13px', cursor: 'pointer',
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          <BarraFiltros filtros={filtros} onChange={mudarFiltros} />

          {error ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '16px', color: C.danger,
            }}>
              <p style={{ fontSize: '16px', marginBottom: '12px' }}>{error}</p>
              <button
                onClick={() => { setPage(1); setReloadKey(k => k + 1); }}
                style={{
                  background: '#FBFAF7', border: '1px solid #E8E5DF',
                  borderRadius: '8px', padding: '8px 18px', color: C.text, fontSize: '13px', cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : loading && products.length === 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '16px',
            }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{
                  height: '360px', borderRadius: '16px',
                  background: '#FFFFFF',
                  border: '1px solid #E8E5DF',
                  backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(244,119,11,0.06) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.4s ease-in-out infinite',
                }} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                textAlign: 'center', padding: '80px 20px',
                color: '#727272',
              }}
            >
              <motion.div
                animate={{ rotate: [0, -6, 6, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 'fit-content', margin: '0 auto 16px' }}
              >
                <Wheat size={48} />
              </motion.div>
              <p style={{ fontSize: '18px', marginBottom: '8px', color: '#4A4A45' }}>
                Nenhum produto encontrado
              </p>
              <p style={{ fontSize: '14px' }}>
                {somenteOfertas ? 'Nenhuma promoção ativa no momento. Volte em breve!' : 'Tente buscar por outra categoria, produto ou ajustar os filtros'}
              </p>
            </motion.div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '16px',
                }}
              >
                {products.map((product, i) => (
                  <ProductCard
                    key={product.id}
                    index={i}
                    product={product}
                    isFavorite={favorites.includes(product.id)}
                    onFavorite={onFavorite}
                    onAddToCart={onAddToCart}
                    onClick={onProductClick}
                  />
                ))}
              </div>

              {page < pages && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={loading}
                    style={{
                      background: 'rgba(244,119,11,0.08)',
                      border: '1px solid rgba(244,119,11,0.25)',
                      borderRadius: '10px', padding: '10px 28px',
                      color: C.orange, fontSize: '14px', fontWeight: 600,
                      cursor: loading ? 'wait' : 'pointer',
                    }}
                  >
                    {loading ? 'Carregando...' : 'Carregar mais'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Sell CTA */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          style={{ marginTop: '60px', marginBottom: '20px' }}
        >
          <div style={{
            background: C.graphite,
            border: 'none',
            borderRadius: '20px',
            padding: 'clamp(24px, 4vw, 48px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '-50px', right: '-50px',
              width: '200px', height: '200px',
              background: 'radial-gradient(circle, rgba(244,119,11,0.12) 0%, transparent 70%)',
            }} />
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Wheat size={48} color={C.orange} />
            </motion.div>
            <h2 style={{
              fontFamily: FONT,
              fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, color: '#fff',
            }}>
              Quer vender na AgroMundo?
            </h2>
            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', maxWidth: '500px' }}>
              Cadastre seus produtos e alcance milhares de compradores em todo o Brasil.
              Sem mensalidade, sem complicação.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <motion.button onClick={onStartSelling} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{
                background: '#F4770B',
                border: 'none', borderRadius: '12px',
                padding: '14px 32px', color: '#fff',
                fontSize: '16px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 8px 25px rgba(244,119,11,0.3)',
                fontFamily: FONT,
              }}>
                Começar a Vender
              </motion.button>
              <button style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px',
                padding: '14px 32px', color: '#fff',
                fontSize: '16px', fontWeight: 600, cursor: 'pointer',
                fontFamily: FONT,
              }}>
                Saiba Mais
              </button>
            </div>
          </div>
        </motion.section>

      </div>
      <style>{`@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }`}</style>
    </div>
  );
}
