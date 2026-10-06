import { useState } from 'react';
import { Heart, ShoppingCart, MapPin, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Product, formatCurrency } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';

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

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
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
        background: hovered
          ? 'rgba(20, 50, 28, 0.9)'
          : 'rgba(10, 28, 15, 0.8)',
        backdropFilter: 'blur(20px)',
        border: hovered
          ? '1px solid rgba(74, 250, 130, 0.4)'
          : '1px solid rgba(74, 250, 130, 0.12)',
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
        boxShadow: hovered
          ? '0 20px 40px rgba(0,0,0,0.4), 0 0 30px rgba(74, 250, 130, 0.1)'
          : '0 4px 16px rgba(0,0,0,0.3)',
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

        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(4, 18, 8, 0.6) 100%)',
        }} />

        {/* Zona do endereço do anúncio */}
        {product.zona && (
          <div style={{
            position: 'absolute', top: '10px', left: '10px',
            background: product.zona === 'RURAL'
              ? 'linear-gradient(135deg, #16a34a, #4afa82)'
              : 'linear-gradient(135deg, #0891b2, #38bdf8)',
            color: product.zona === 'RURAL' ? '#000' : '#fff',
            fontSize: '10px', fontWeight: 700,
            padding: '3px 8px', borderRadius: '6px',
            letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif",
          }}>
            {product.zona}
          </div>
        )}

        {/* Favorite button */}
        <motion.button
          onClick={handleFavorite}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.85 }}
          style={{
            position: 'absolute', top: '10px', right: '10px',
            background: isFavorite ? 'rgba(74, 250, 130, 0.2)' : 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${isFavorite ? 'rgba(74, 250, 130, 0.5)' : 'rgba(255,255,255,0.2)'}`,
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
              color={isFavorite ? '#4afa82' : '#fff'}
              fill={isFavorite ? '#4afa82' : 'none'}
            />
          </motion.span>
        </motion.button>
      </div>

      {/* Info */}
      <div style={{ padding: '14px' }}>
        {/* Category */}
        <div style={{
          fontSize: '11px',
          color: '#4afa82',
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
          color: '#fff',
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
          color: 'rgba(255,255,255,0.5)',
          marginBottom: '8px',
          display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{
            width: '18px', height: '18px',
            background: 'linear-gradient(135deg, #0d3a1a, #1a5c38)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '8px', fontWeight: 700, color: '#4afa82',
            flexShrink: 0,
          }}>
            {product.producerAvatar}
          </div>
          <span>{product.producer}</span>
        </div>

        {/* Location */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '3px',
          marginBottom: '10px',
          color: 'rgba(255,255,255,0.4)', fontSize: '11px',
          fontFamily: "'Inter', sans-serif",
        }}>
          <MapPin size={11} />
          <span>{product.location}</span>
        </div>

        {/* Price */}
        <div style={{ marginBottom: '12px' }}>
          <span style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#4afa82',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {formatCurrency(product.price)}
          </span>
        </div>

        {/* Add to cart button */}
        <motion.button
          onClick={handleAddToCart}
          whileTap={{ scale: 0.96 }}
          style={{
            width: '100%',
            padding: '10px',
            background: added
              ? 'rgba(74, 250, 130, 0.2)'
              : 'linear-gradient(135deg, #16a34a, #4afa82)',
            border: added ? '1px solid #4afa82' : 'none',
            borderRadius: '10px',
            color: added ? '#4afa82' : '#000',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            fontFamily: "'Inter', sans-serif",
            boxShadow: added ? 'none' : '0 4px 15px rgba(74, 250, 130, 0.3)',
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
              {added ? 'Adicionado!' : 'Adicionar ao Carrinho'}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.div>
  );
}
