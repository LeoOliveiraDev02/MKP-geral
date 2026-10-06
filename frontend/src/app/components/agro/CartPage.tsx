import { useState } from 'react';
import { ShoppingCart, Trash2, ArrowLeft, Tag, Truck, Shield, ChevronRight, Check, PartyPopper } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CartItem, formatCurrency } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';

type CartPageProps = {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onBack: () => void;
};

export function CartPage({ items, onUpdateQuantity, onRemove, onBack }: CartPageProps) {
  const [coupon, setCoupon] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);

  const subtotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const discount = couponApplied ? subtotal * 0.1 : 0;
  const shipping = subtotal > 500 ? 0 : 49.90;
  const total = subtotal - discount + shipping;

  const handleCoupon = () => {
    if (coupon.toUpperCase() === 'AGRO10') {
      setCouponApplied(true);
    }
  };

  if (checkoutDone) {
    return (
      <div style={{
        background: '#040e07', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center', padding: '40px' }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
            style={{
            width: '100px', height: '100px',
            background: 'linear-gradient(135deg, #16a34a, #4afa82)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 0 50px rgba(74, 250, 130, 0.4)',
          }}>
            <Check size={52} color="#000" strokeWidth={3} />
          </motion.div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '32px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
            Pedido Realizado!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px', marginBottom: '32px', maxWidth: '400px', margin: '0 auto 32px' }}>
            Seu pedido foi confirmado com sucesso. Você receberá um e-mail com os detalhes da entrega.
          </p>
          <div style={{
            background: 'rgba(74, 250, 130, 0.08)',
            border: '1px solid rgba(74, 250, 130, 0.2)',
            borderRadius: '12px', padding: '16px',
            display: 'inline-block', marginBottom: '32px',
          }}>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Número do pedido</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: 700, color: '#4afa82' }}>
              #AGR-{Math.floor(Math.random() * 90000) + 10000}
            </div>
          </div>
          <br />
          <button
            onClick={onBack}
            style={{
              background: 'linear-gradient(135deg, #16a34a, #4afa82)',
              border: 'none', borderRadius: '12px',
              padding: '14px 32px', color: '#000',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Continuar Comprando
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ background: '#040e07', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(74,250,130,0.15)',
              borderRadius: '10px', padding: '8px 16px',
              color: 'rgba(255,255,255,0.7)', fontSize: '13px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <ArrowLeft size={16} /> Continuar Comprando
          </button>
          <div>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '28px', fontWeight: 800, color: '#fff' }}>
              Meu Carrinho
            </h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <ShoppingCart size={64} color="rgba(74,250,130,0.3)" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
              Seu carrinho está vazio
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '28px' }}>
              Explore nosso marketplace e adicione produtos ao carrinho
            </p>
            <button
              onClick={onBack}
              style={{
                background: 'linear-gradient(135deg, #16a34a, #4afa82)',
                border: 'none', borderRadius: '12px',
                padding: '14px 32px', color: '#000',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Explorar Produtos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Cart items */}
            <div style={{ gridColumn: '1 / span 2' }}>
              <div className="flex flex-col gap-4">
                <AnimatePresence initial={false}>
                {items.map(({ product, quantity }) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                    background: 'rgba(10, 28, 15, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(74,250,130,0.12)',
                    borderRadius: '16px', padding: '16px',
                    display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap',
                  }}>
                    <div style={{ width: '90px', height: '90px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
                      <ImageWithFallback
                        src={product.image}
                        alt={product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <div style={{ fontSize: '12px', color: '#4afa82', marginBottom: '3px' }}>{product.category}</div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '4px', lineHeight: 1.3 }}>
                        {product.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {product.producer} • {product.location}
                      </div>
                    </div>

                    {/* Quantity controls */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(74,250,130,0.15)',
                      borderRadius: '10px', overflow: 'hidden',
                    }}>
                      <button
                        onClick={() => quantity <= 1 ? onRemove(product.id) : onUpdateQuantity(product.id, quantity - 1)}
                        style={{
                          width: '36px', height: '36px', background: 'none', border: 'none',
                          color: '#4afa82', fontSize: '18px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        −
                      </button>
                      <span style={{
                        width: '36px', textAlign: 'center', color: '#fff',
                        fontSize: '15px', fontWeight: 600,
                      }}>
                        {quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                        style={{
                          width: '36px', height: '36px', background: 'none', border: 'none',
                          color: '#4afa82', fontSize: '18px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        +
                      </button>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: '100px' }}>
                      <div style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: '18px', fontWeight: 700, color: '#4afa82',
                      }}>
                        {formatCurrency(product.price * quantity)}
                      </div>
                      {quantity > 1 && (
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                          {formatCurrency(product.price)} cada
                        </div>
                      )}
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.1, rotate: -8 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onRemove(product.id)}
                      style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: '8px', padding: '8px',
                        cursor: 'pointer', color: '#f87171',
                      }}
                    >
                      <Trash2 size={15} />
                    </motion.button>
                  </motion.div>
                ))}
                </AnimatePresence>
              </div>

              {/* Delivery info */}
              <div style={{
                marginTop: '16px',
                background: 'rgba(74, 250, 130, 0.06)',
                border: '1px solid rgba(74,250,130,0.15)',
                borderRadius: '12px', padding: '14px',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <Truck size={18} color="#4afa82" />
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                  {subtotal > 500
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><PartyPopper size={16} color="#4afa82" /> Frete grátis para este pedido!</span>
                    : `Adicione mais ${formatCurrency(500 - subtotal)} para frete grátis`}
                </span>
              </div>
            </div>

            {/* Order summary */}
            <div>
              <div style={{
                background: 'rgba(10, 28, 15, 0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(74,250,130,0.15)',
                borderRadius: '20px', padding: '24px',
                position: 'sticky', top: '100px',
              }}>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '20px' }}>
                  Resumo do Pedido
                </h3>

                <div className="flex flex-col gap-3" style={{ marginBottom: '20px' }}>
                  <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
                  {couponApplied && <SummaryRow label="Desconto (10%)" value={`-${formatCurrency(discount)}`} green />}
                  <SummaryRow label="Frete" value={shipping === 0 ? 'Grátis' : formatCurrency(shipping)} green={shipping === 0} />
                </div>

                <div style={{
                  borderTop: '1px solid rgba(74,250,130,0.1)',
                  paddingTop: '16px', marginBottom: '20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Total</span>
                  <span style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '24px', fontWeight: 800, color: '#4afa82',
                  }}>
                    {formatCurrency(total)}
                  </span>
                </div>

                {/* Coupon */}
                {!couponApplied && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      display: 'flex', gap: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(74,250,130,0.12)',
                      borderRadius: '10px', overflow: 'hidden',
                    }}>
                      <input
                        placeholder="Código de cupom"
                        value={coupon}
                        onChange={e => setCoupon(e.target.value)}
                        style={{
                          flex: 1, background: 'transparent', border: 'none', outline: 'none',
                          padding: '10px 14px', color: '#fff', fontSize: '13px',
                          fontFamily: "'Inter', sans-serif",
                        }}
                      />
                      <button
                        onClick={handleCoupon}
                        style={{
                          background: 'rgba(74,250,130,0.15)',
                          border: 'none', padding: '10px 14px',
                          color: '#4afa82', fontSize: '13px', fontWeight: 600,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        <Tag size={14} /> Aplicar
                      </button>
                    </div>
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '6px' }}>
                      Dica: use AGRO10 para 10% de desconto
                    </p>
                  </div>
                )}

                {couponApplied && (
                  <div style={{
                    background: 'rgba(74,250,130,0.1)', border: '1px solid rgba(74,250,130,0.25)',
                    borderRadius: '8px', padding: '8px 12px', marginBottom: '16px',
                    fontSize: '13px', color: '#4afa82', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <Check size={14} /> Cupom AGRO10 aplicado — 10% de desconto!
                  </div>
                )}

                <button
                  onClick={() => setCheckoutDone(true)}
                  style={{
                    width: '100%', padding: '16px',
                    background: 'linear-gradient(135deg, #16a34a, #4afa82)',
                    border: 'none', borderRadius: '12px',
                    color: '#000', fontSize: '16px', fontWeight: 700,
                    cursor: 'pointer', marginBottom: '12px',
                    boxShadow: '0 8px 25px rgba(74,250,130,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Finalizar Pedido <ChevronRight size={18} />
                </button>

                <div className="flex items-center justify-center gap-2" style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>
                  <Shield size={12} />
                  Pagamento 100% seguro e criptografado
                </div>

                {/* Payment icons */}
                <div className="flex items-center justify-center gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
                  {['PIX', 'Visa', 'Master', 'Boleto', 'Parcelado'].map(m => (
                    <span key={m} style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px', padding: '3px 8px',
                      fontSize: '10px', color: 'rgba(255,255,255,0.5)',
                    }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: green ? '#4afa82' : 'rgba(255,255,255,0.8)' }}>{value}</span>
    </div>
  );
}
