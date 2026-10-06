import { useEffect, useState } from 'react';
import { ArrowRight, TrendingUp, Shield, MessageCircle, Headphones, ChevronLeft, ChevronRight, Wheat } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PROMO_BANNERS, Product, Category } from './data';
import { ProductCard } from './ProductCard';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { AnuncioService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { anuncioResumoToProduct } from '../../api/mappers';

const PAGE_SIZE = 12;
const HERO_INTERVAL_MS = 7000;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// Entrada em cascata dos elementos de texto do hero.
const heroItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

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
};

export function HomePage({
  categories, favorites, onFavorite, onAddToCart, onProductClick,
  searchQuery, activeCategory, onCategoryChange, onStartSelling,
}: HomePageProps) {
  const [heroBanner, setHeroBanner] = useState(0);
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
  }, [searchQuery, activeCategory]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    AnuncioService.list({
      page,
      limit: PAGE_SIZE,
      search: searchQuery || null,
      categoriaId: activeCategory ? Number(activeCategory) : null,
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
  }, [page, searchQuery, activeCategory, reloadKey]);

  // Troca automática do banner; reinicia o contador sempre que o usuário navega manualmente.
  useEffect(() => {
    const id = setTimeout(() => setHeroBanner(v => (v + 1) % 3), HERO_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [heroBanner]);

  const scrollToProducts = () =>
    document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' });

  const heroBanners = [
    {
      title: 'O Futuro do\nAgronegócio',
      subtitle: 'Conectando produtores e compradores em todo o Brasil',
      cta: 'Explorar Produtos',
      tag: 'MARKETPLACE #1',
      image: 'https://images.unsplash.com/photo-1508175688576-0c076b47b5b5?w=1400&q=80',
    },
    {
      title: 'Sementes de\nAlta Performance',
      subtitle: 'As melhores variedades para máxima produtividade',
      cta: 'Ver Sementes',
      tag: 'TEMPORADA 2026',
      image: 'https://images.unsplash.com/photo-1619719826894-89d6c4fd5739?w=1400&q=80',
    },
    {
      title: 'Máquinas e\nEquipamentos',
      subtitle: 'Tecnologia de ponta para sua lavoura',
      cta: 'Ver Máquinas',
      tag: 'FINANCIAMENTO 0%',
      image: 'https://images.unsplash.com/photo-1717702576954-c07131c54169?w=1400&q=80',
    },
  ];

  return (
    <div style={{ background: '#040e07', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

      {/* Hero Banner */}
      <section style={{ position: 'relative', height: 'clamp(340px, 55vh, 520px)', overflow: 'hidden' }}>
        <AnimatePresence initial={false}>
          <motion.div
            key={heroBanner}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.8 }, scale: { duration: 7, ease: 'linear' } }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <ImageWithFallback
              src={heroBanners[heroBanner].image}
              alt="Hero"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </motion.div>
        </AnimatePresence>
        {/* Dark overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(4,14,7,0.9) 0%, rgba(4,14,7,0.5) 50%, rgba(4,14,7,0.3) 100%)',
        }} />
        {/* Neon glow effect */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, transparent, #4afa82, transparent)',
          boxShadow: '0 0 20px #4afa82',
        }} />

        {/* Content */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '0 clamp(20px, 5vw, 80px)',
          maxWidth: '700px',
        }}>
          <AnimatePresence mode="wait">
          <motion.div
            key={heroBanner}
            initial="hidden"
            animate="show"
            exit="exit"
            variants={{ show: { transition: { staggerChildren: 0.08 } } }}
          >
          <motion.div variants={heroItem} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(74, 250, 130, 0.15)',
            border: '1px solid rgba(74, 250, 130, 0.3)',
            borderRadius: '20px', padding: '4px 14px',
            marginBottom: '16px', width: 'fit-content',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4afa82', boxShadow: '0 0 8px #4afa82' }} />
            <span style={{ fontSize: '12px', color: '#4afa82', fontWeight: 600, letterSpacing: '1px' }}>
              {heroBanners[heroBanner].tag}
            </span>
          </motion.div>

          <motion.h1 variants={heroItem} style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1.1,
            marginBottom: '16px',
            whiteSpace: 'pre-line',
            textShadow: '0 2px 20px rgba(0,0,0,0.5)',
          }}>
            {heroBanners[heroBanner].title}
          </motion.h1>
          <motion.p variants={heroItem} style={{
            fontSize: 'clamp(14px, 2vw, 18px)',
            color: 'rgba(255,255,255,0.75)',
            marginBottom: '28px',
            lineHeight: 1.5,
          }}>
            {heroBanners[heroBanner].subtitle}
          </motion.p>
          </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap gap-3">
            <motion.button onClick={scrollToProducts} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{
              background: 'linear-gradient(135deg, #16a34a, #4afa82)',
              border: 'none', borderRadius: '12px',
              padding: '12px 28px', color: '#000',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 8px 25px rgba(74, 250, 130, 0.4)',
              fontFamily: "'Inter', sans-serif",
            }}>
              {heroBanners[heroBanner].cta}
              <ArrowRight size={18} />
            </motion.button>
            <motion.button onClick={onStartSelling} whileHover={{ scale: 1.04, backgroundColor: 'rgba(255,255,255,0.14)' }} whileTap={{ scale: 0.97 }} style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '12px', padding: '12px 28px',
              color: '#fff', fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}>
              Quero Vender
            </motion.button>
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-8">
            {[
              { value: '12.000+', label: 'Produtos' },
              { value: '3.500+', label: 'Produtores' },
              { value: '48h', label: 'Entrega' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: EASE_OUT }}
              >
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: 700, color: '#4afa82' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Banner navigation */}
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', gap: '8px' }}>
          {heroBanners.map((_, i) => (
            <button
              key={i}
              onClick={() => setHeroBanner(i)}
              style={{
                width: i === heroBanner ? '24px' : '8px',
                height: '8px', borderRadius: '4px',
                background: i === heroBanner ? '#4afa82' : 'rgba(255,255,255,0.4)',
                border: 'none', cursor: 'pointer',
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => setHeroBanner(v => (v - 1 + heroBanners.length) % heroBanners.length)}
          style={{
            position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%',
            width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => setHeroBanner(v => (v + 1) % heroBanners.length)}
          style={{
            position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%',
            width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <ChevronRight size={20} />
        </button>
      </section>

      {/* Trust badges */}
      <section style={{ background: 'rgba(16, 42, 22, 0.8)', borderBottom: '1px solid rgba(74,250,130,0.1)' }}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: <MessageCircle size={20} />, title: 'Contato Direto', sub: 'Negocie pelo WhatsApp' },
              { icon: <Shield size={20} />, title: 'Sem Intermediários', sub: 'Do produtor para você' },
              { icon: <TrendingUp size={20} />, title: 'Melhor Preço', sub: 'Preço de produtor' },
              { icon: <Headphones size={20} />, title: 'Suporte 24h', sub: 'Atendimento especializado' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                className="flex items-center gap-3"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4, ease: EASE_OUT }}
              >
                <div style={{
                  width: '40px', height: '40px',
                  background: 'rgba(74, 250, 130, 0.1)',
                  border: '1px solid rgba(74, 250, 130, 0.2)',
                  borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#4afa82', flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{item.title}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{item.sub}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Categories section */}
        <section style={{ marginBottom: '40px' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: 700, color: '#fff' }}>
              Categorias
            </h2>
            <button onClick={() => onCategoryChange(null)} style={{
              background: 'none', border: 'none', color: '#4afa82',
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
                    ? 'rgba(74, 250, 130, 0.15)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${activeCategory === cat.id ? 'rgba(74, 250, 130, 0.5)' : 'rgba(74, 250, 130, 0.1)'}`,
                  borderRadius: '14px', padding: '12px 6px',
                  cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                }}
              >
                <cat.icon size={24} color={cat.color} />
                <span style={{
                  fontSize: '12px', color: activeCategory === cat.id ? '#4afa82' : 'rgba(255,255,255,0.6)',
                  lineHeight: 1.2, fontWeight: 500,
                }}>
                  {cat.name}
                </span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Promo banners */}
        {!searchQuery && !activeCategory && (
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
                    border: '1px solid rgba(74, 250, 130, 0.15)',
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
                    background: 'linear-gradient(to right, rgba(4,14,7,0.9) 40%, rgba(4,14,7,0.3) 100%)',
                  }} />
                  <div style={{
                    position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)',
                  }}>
                    <div style={{
                      background: 'rgba(74, 250, 130, 0.15)',
                      border: '1px solid rgba(74, 250, 130, 0.3)',
                      borderRadius: '6px', padding: '2px 10px', marginBottom: '8px',
                      fontSize: '10px', color: '#4afa82', fontWeight: 700, letterSpacing: '1px',
                      display: 'inline-block',
                    }}>
                      {banner.tag}
                    </div>
                    <h3 style={{
                      fontFamily: "'Space Grotesk', sans-serif",
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
                    background: 'linear-gradient(135deg, #16a34a, #4afa82)',
                    border: 'none', borderRadius: '10px',
                    padding: '8px 16px', color: '#000',
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
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                {searchQuery
                  ? `Resultados para "${searchQuery}"`
                  : activeCategory
                  ? categories.find(c => c.id === activeCategory)?.name || 'Produtos'
                  : 'Anúncios Recentes'}
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
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
                  color: '#f87171', fontSize: '13px', cursor: 'pointer',
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          {error ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '16px', color: '#f87171',
            }}>
              <p style={{ fontSize: '16px', marginBottom: '12px' }}>{error}</p>
              <button
                onClick={() => { setPage(1); setReloadKey(k => k + 1); }}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px', padding: '8px 18px', color: '#fff', fontSize: '13px', cursor: 'pointer',
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
                  background: 'rgba(10, 28, 15, 0.8)',
                  border: '1px solid rgba(74, 250, 130, 0.08)',
                  backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(74, 250, 130, 0.06) 50%, transparent 100%)',
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
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              <motion.div
                animate={{ rotate: [0, -6, 6, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 'fit-content', margin: '0 auto 16px' }}
              >
                <Wheat size={48} />
              </motion.div>
              <p style={{ fontSize: '18px', marginBottom: '8px', color: 'rgba(255,255,255,0.6)' }}>
                Nenhum produto encontrado
              </p>
              <p style={{ fontSize: '14px' }}>Tente buscar por outra categoria ou produto</p>
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
                      background: 'rgba(74, 250, 130, 0.08)',
                      border: '1px solid rgba(74, 250, 130, 0.25)',
                      borderRadius: '10px', padding: '10px 28px',
                      color: '#4afa82', fontSize: '14px', fontWeight: 600,
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
            background: 'linear-gradient(135deg, rgba(22, 101, 52, 0.4) 0%, rgba(74, 250, 130, 0.08) 100%)',
            border: '1px solid rgba(74, 250, 130, 0.2)',
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
              background: 'radial-gradient(circle, rgba(74,250,130,0.12) 0%, transparent 70%)',
            }} />
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Wheat size={48} color="#4afa82" />
            </motion.div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
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
                background: 'linear-gradient(135deg, #16a34a, #4afa82)',
                border: 'none', borderRadius: '12px',
                padding: '14px 32px', color: '#000',
                fontSize: '16px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 8px 25px rgba(74, 250, 130, 0.3)',
                fontFamily: "'Inter', sans-serif",
              }}>
                Começar a Vender
              </motion.button>
              <button style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px',
                padding: '14px 32px', color: '#fff',
                fontSize: '16px', fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
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
