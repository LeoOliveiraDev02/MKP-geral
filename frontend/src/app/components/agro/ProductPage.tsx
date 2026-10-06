import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, ShoppingCart, MapPin, Calendar, MessageCircle, ChevronLeft, ChevronRight, Share2, Check, Wheat } from 'lucide-react';
import { toast } from 'sonner';
import { Product, formatCurrency, formatDate } from './data';
import { ProductCard } from './ProductCard';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { AnuncioService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { anuncioDetalheToProduct, anuncioResumoToProduct } from '../../api/mappers';

type ProductPageProps = {
  productId: string;
  favorites: string[];
  onFavorite: (id: string) => void;
  onAddToCart: (product: Product) => void;
  onBack: () => void;
  onProductClick: (product: Product) => void;
};

export function ProductPage({ productId, favorites, onFavorite, onAddToCart, onBack, onProductClick }: ProductPageProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // GET /ads/:id + relacionados da mesma categoria (GET /ads?categoriaId=).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedImage(0);
    setQuantity(1);

    AnuncioService.get(productId)
      .then(detail => {
        if (cancelled) return;
        const p = anuncioDetalheToProduct(detail);
        setProduct(p);
        return AnuncioService.list({ categoriaId: Number(p.categoryId), limit: 5 }).then(result => {
          if (cancelled) return;
          setRelated(result.data.filter(ad => String(ad.id) !== p.id).slice(0, 4).map(anuncioResumoToProduct));
        });
      })
      .catch(err => { if (!cancelled) setError(getErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [productId]);

  if (loading || error || !product) {
    return (
      <div style={{ background: '#040e07', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <BackButton onClick={onBack} />
          <div style={{ textAlign: 'center', padding: '100px 20px', color: error ? '#f87171' : 'rgba(255,255,255,0.5)' }}>
            {error ? (
              <>
                <Wheat size={48} style={{ margin: '0 auto 16px' }} />
                <p style={{ fontSize: '18px' }}>{error}</p>
              </>
            ) : (
              <p style={{ fontSize: '16px' }}>Carregando anúncio...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isFavorite = favorites.includes(product.id);
  const images = product.images.length > 0 ? product.images : [product.image];

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) onAddToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado para a área de transferência.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const publishedAt = formatDate(product.publishedAt);

  return (
    <div style={{ background: '#040e07', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Breadcrumb / back */}
        <div className="flex items-center gap-2 mb-6">
          <BackButton onClick={onBack} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
            Início / {product.category} / {product.name.length > 30 ? `${product.name.substring(0, 30)}...` : product.name}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Image gallery */}
          <div>
            {/* Main image */}
            <div style={{
              position: 'relative',
              borderRadius: '20px',
              overflow: 'hidden',
              height: '420px',
              background: 'rgba(10, 28, 15, 0.8)',
              border: '1px solid rgba(74, 250, 130, 0.15)',
              marginBottom: '12px',
            }}>
              <ImageWithFallback
                src={images[selectedImage]}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, transparent 60%, rgba(4,14,7,0.5) 100%)',
              }} />

              {/* Nav arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setSelectedImage(v => (v - 1 + images.length) % images.length)}
                    style={galleryArrowStyle('left')}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setSelectedImage(v => (v + 1) % images.length)}
                    style={galleryArrowStyle('right')}
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}

              {product.zona && (
                <div style={{
                  position: 'absolute', top: '16px', left: '16px',
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  color: '#000', fontSize: '12px', fontWeight: 700,
                  padding: '4px 12px', borderRadius: '8px',
                }}>
                  ZONA {product.zona}
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-3">
                {images.map((img, i) => (
                  <button
                    key={img}
                    onClick={() => setSelectedImage(i)}
                    style={{
                      width: '80px', height: '80px',
                      borderRadius: '10px', overflow: 'hidden',
                      border: `2px solid ${i === selectedImage ? '#4afa82' : 'rgba(74,250,130,0.15)'}`,
                      cursor: 'pointer', padding: 0,
                      transition: 'border-color 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <ImageWithFallback
                      src={img}
                      alt={`${product.name} ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div>
            {/* Category + share */}
            <div className="flex items-center justify-between mb-3">
              <span style={{
                background: 'rgba(74, 250, 130, 0.1)',
                border: '1px solid rgba(74, 250, 130, 0.2)',
                borderRadius: '6px', padding: '3px 10px',
                color: '#4afa82', fontSize: '12px', fontWeight: 600,
              }}>
                {product.category}
              </span>
              <button onClick={handleShare} style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px', padding: '6px 12px',
                color: 'rgba(255,255,255,0.6)', fontSize: '12px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <Share2 size={14} /> Compartilhar
              </button>
            </div>

            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 700, color: '#fff',
              marginBottom: '12px', lineHeight: 1.2,
            }}>
              {product.name}
            </h1>

            {publishedAt && (
              <div className="flex items-center gap-2 mb-4" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
                <Calendar size={14} /> Publicado em {publishedAt}
              </div>
            )}

            {/* Producer */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(74,250,130,0.1)',
              borderRadius: '12px', padding: '10px 14px',
              marginBottom: '20px',
            }}>
              <div style={{
                width: '40px', height: '40px',
                background: 'linear-gradient(135deg, #0d3a1a, #1a5c38)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: '#4afa82', flexShrink: 0,
              }}>
                {product.producerAvatar}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{product.producer}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={11} /> {product.location}
                </div>
              </div>
            </div>

            {/* Price */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '36px', fontWeight: 800, color: '#4afa82',
                lineHeight: 1,
              }}>
                {formatCurrency(product.price)}
              </div>
            </div>

            {/* Contato com o vendedor (UC4 — link gerado pelo backend) */}
            {product.whatsappUrl && (
              <a
                href={product.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '100%', padding: '14px',
                  background: 'linear-gradient(135deg, #16a34a, #25d366)',
                  border: 'none', borderRadius: '12px', color: '#fff',
                  fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                  marginBottom: '14px', fontFamily: "'Inter', sans-serif",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 8px 25px rgba(37, 211, 102, 0.3)',
                  textDecoration: 'none', boxSizing: 'border-box',
                }}
              >
                <MessageCircle size={18} /> Negociar pelo WhatsApp
              </a>
            )}

            {/* Quantity + add to cart */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(74,250,130,0.15)',
                borderRadius: '12px', overflow: 'hidden',
              }}>
                <button onClick={() => setQuantity(v => Math.max(1, v - 1))} style={quantityButtonStyle}>
                  −
                </button>
                <span style={{ width: '48px', textAlign: 'center', color: '#fff', fontSize: '16px', fontWeight: 600 }}>
                  {quantity}
                </span>
                <button onClick={() => setQuantity(v => v + 1)} style={quantityButtonStyle}>
                  +
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                style={{
                  flex: 1, minWidth: '180px',
                  padding: '14px 24px',
                  background: added ? 'rgba(74, 250, 130, 0.15)' : 'rgba(74, 250, 130, 0.08)',
                  border: '1px solid rgba(74,250,130,0.3)',
                  borderRadius: '12px',
                  color: '#4afa82',
                  fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 0.2s',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {added ? <Check size={18} /> : <ShoppingCart size={18} />}
                {added ? 'Adicionado ao Carrinho!' : 'Adicionar ao Carrinho'}
              </button>

              <button
                onClick={() => onFavorite(product.id)}
                title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                style={{
                  width: '50px', height: '50px',
                  background: isFavorite ? 'rgba(74, 250, 130, 0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isFavorite ? 'rgba(74,250,130,0.4)' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: '12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <Heart size={20} color={isFavorite ? '#4afa82' : '#fff'} fill={isFavorite ? '#4afa82' : 'none'} />
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{
            background: 'rgba(10, 28, 15, 0.6)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(74,250,130,0.1)',
            borderRadius: '16px', padding: '28px',
          }}>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '16px',
            }}>
              Descrição do Produto
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.8, fontSize: '15px', whiteSpace: 'pre-line' }}>
              {product.description}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {[
                { label: 'Categoria', value: product.category },
                { label: 'Localização', value: product.location },
                { label: 'Zona', value: product.zona ?? '—' },
                { label: 'Produtor', value: product.producer },
              ].map(info => (
                <div key={info.label} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(74,250,130,0.08)',
                  borderRadius: '10px', padding: '12px',
                }}>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {info.label}
                  </div>
                  <div style={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>{info.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related products */}
        {related.length > 0 && (
          <section>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '20px',
            }}>
              Produtos Relacionados
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
            }}>
              {related.map((p, i) => (
                <ProductCard
                  key={p.id}
                  index={i}
                  product={p}
                  isFavorite={favorites.includes(p.id)}
                  onFavorite={onFavorite}
                  onAddToCart={onAddToCart}
                  onClick={onProductClick}
                />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(74,250,130,0.15)',
        borderRadius: '10px', padding: '8px 16px',
        color: 'rgba(255,255,255,0.7)', fontSize: '13px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
      }}
    >
      <ArrowLeft size={16} /> Voltar
    </button>
  );
}

function galleryArrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', [side]: '12px', top: '50%', transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%',
    width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#fff',
  };
}

const quantityButtonStyle: React.CSSProperties = {
  width: '40px', height: '50px', background: 'none', border: 'none',
  color: '#4afa82', fontSize: '20px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
