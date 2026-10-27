import { useState } from 'react';
import { Heart, ShoppingCart, MapPin, Check, Star, BadgeCheck, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Product, formatCurrency, UNIDADES } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';

type ProductCardProps = {
  product: Product;
  isFavorite: boolean;
  onFavorite: (id: string) => void;
  onAddToCart: (product: Product) => void;
  onClick: (product: Product) => void;
  /** Posição na grade, usada para escalonar a animação de entrada. */
  index?: number;
};

export function ProductCard({ product, isFavorite, onFavorite, onAddToCart, onClick, index = 0 }: ProductCardProps) {
  const [hovered, setHovered] = useState(false);
  const [added, setAdded] = useState(false);

  const semEstoque = product.estoque === 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (semEstoque) return;
    onAddToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite(product.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: (index % 4) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(product)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.surface,
        border: `1px solid ${hovered ? '#D9D4CA' : C.border}`,
        borderRadius: '14px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
        boxShadow: hovered
          ? '0 12px 28px rgba(37,37,34,0.10)'
          : '0 1px 2px rgba(37,37,34,0.04)',
        fontFamily: FONT,
        position: 'relative',
      }}
    >
      {/* Image container */}
      <div style={{ position: 'relative', overflow: 'hidden', height: '200px' }}>
        <ImageWithFallback
          src={product.image}
          alt={product.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.4s ease',
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
          }}
        />

        {/* Oferta e zona do endereço do anúncio */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px' }}>
          {product.emOferta && product.precoPromocional !== null && (
            <div style={{
              background: C.orange, color: '#fff', fontSize: '10px', fontWeight: 700,
              padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px',
            }}>
              <Zap size={11} /> -{Math.round((1 - product.precoPromocional / product.price) * 100)}%
            </div>
          )}
          {product.zona && (
            <div style={{
              background: product.zona === 'RURAL' ? '#F9B95C' : C.surface,
              color: C.graphite,
              fontSize: '10px', fontWeight: 700,
              padding: '3px 8px', borderRadius: '6px',
              letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif",
            }}>
              {product.zona}
            </div>
          )}
        </div>
        {semEstoque && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ background: C.graphite, color: '#fff', fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '999px' }}>Sem estoque</span>
          </div>
        )}

        {/* Favorite button */}
        <motion.button
          onClick={handleFavorite}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.85 }}
          style={{
            position: 'absolute', top: '10px', right: '10px',
            background: isFavorite ? C.orangeSoft : 'rgba(255,255,255,0.92)',
            border: `1px solid ${isFavorite ? C.orange : C.border}`,
            borderRadius: '50%', width: '36px', height: '36px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <motion.span
            key={isFavorite ? 'on' : 'off'}
            initial={{ scale: isFavorite ? 0.4 : 1 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 12 }}
            style={{ display: 'flex' }}
          >
            <Heart
              size={16}
              color={isFavorite ? C.orange : C.graphite}
              fill={isFavorite ? C.orange : 'none'}
            />
          </motion.span>
        </motion.button>
      </div>

      {/* Info */}
      <div style={{ padding: '14px' }}>
        {/* Category */}
        <div style={{
          fontSize: '11px',
          color: C.brown, fontWeight: 600,
          marginBottom: '4px',
          display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: "'Inter', sans-serif",
        }}>
          <span>{product.category}</span>
        </div>

        {/* Name */}
        <h3 style={{
          fontSize: '14px',
          fontWeight: 600,
          color: C.text,
          marginBottom: '4px',
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontFamily: "'Inter', sans-serif",
        }}>
          {product.name}
        </h3>

        {/* Producer */}
        <div style={{
          fontSize: '12px',
          color: C.muted,
          marginBottom: '8px',
          display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{
            width: '18px', height: '18px',
            background: C.orangeSoft,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '8px', fontWeight: 700, color: C.brown,
            flexShrink: 0,
          }}>
            {product.producerAvatar}
          </div>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.producer}</span>
          {product.vendedorVerificado && (
            <span title="Produtor verificado" style={{ display: 'flex', color: C.success, flexShrink: 0 }}><BadgeCheck size={14} /></span>
          )}
        </div>

        {/* Location */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '3px',
          marginBottom: '10px',
          color: C.muted, fontSize: '11px',
          fontFamily: "'Inter', sans-serif",
        }}>
          <MapPin size={11} />
          <span>{product.location}</span>
          {product.distanciaKm != null && <span style={{ color: C.brown, fontWeight: 600 }}>· {product.distanciaKm.toLocaleString('pt-BR')} km</span>}
          {product.notaMedia !== null && product.totalAvaliacoes > 0 && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px', color: C.text, fontWeight: 600 }}>
              <Star size={11} color={C.orange} fill={C.orange} /> {product.notaMedia.toLocaleString('pt-BR')}
              <span style={{ color: C.muted, fontWeight: 400 }}>({product.totalAvaliacoes})</span>
            </span>
          )}
        </div>

        {/* Price */}
        <div style={{ marginBottom: '12px', minHeight: '44px' }}>
          {product.emOferta && (
            <div style={{ fontSize: '12px', color: C.muted, textDecoration: 'line-through' }}>{formatCurrency(product.price)}</div>
          )}
          <span style={{
            fontSize: '20px',
            fontWeight: 700,
            color: C.orange,
          }}>
            {formatCurrency(product.precoEfetivo)}
          </span>
          {product.unidade !== 'un' && (
            <span style={{ fontSize: '12px', color: C.muted }}> / {UNIDADES[product.unidade]?.curto}</span>
          )}
        </div>

        {/* Add to cart button */}
        <motion.button
          onClick={handleAddToCart}
          whileTap={{ scale: 0.96 }}
          style={{
            width: '100%',
            padding: '10px',
            background: added ? C.success : semEstoque ? C.border : C.orange,
            border: 'none',
            borderRadius: '10px',
            color: semEstoque ? C.muted : '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: semEstoque ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={added ? 'added' : 'idle'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {added ? <Check size={15} /> : <ShoppingCart size={15} />}
              {added ? 'Adicionado!' : semEstoque ? 'Sem estoque' : 'Adicionar ao Carrinho'}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.div>
  );
}
