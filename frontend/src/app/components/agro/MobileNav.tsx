import { Home, ShoppingCart, Heart, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { View } from '../../App';

type MobileNavProps = {
  currentView: View;
  onNavigate: (view: View) => void;
  cartCount: number;
  favCount: number;
  isLoggedIn: boolean;
};

export function MobileNav({ currentView, onNavigate, cartCount, favCount, isLoggedIn }: MobileNavProps) {
  const items = [
    { view: 'home' as View, label: 'Início', icon: Home },
    { view: 'cart' as View, label: 'Carrinho', icon: ShoppingCart, count: cartCount },
    { view: 'favorites' as View, label: 'Favoritos', icon: Heart, count: favCount },
    { view: (isLoggedIn ? 'profile' : 'auth') as View, label: isLoggedIn ? 'Perfil' : 'Entrar', icon: User },
  ];

  return (
    <nav
      className="md:hidden"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(4, 18, 8, 0.97)',
        backdropFilter: 'blur(30px)',
        borderTop: '1px solid rgba(74, 250, 130, 0.15)',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {items.map(({ view, label, icon: Icon, count }) => {
          const isActive = currentView === view;
          return (
            <motion.button
              key={label}
              whileTap={{ scale: 0.88 }}
              onClick={() => onNavigate(view)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '3px', padding: '10px 4px',
                background: 'none', border: 'none', cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s',
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  style={{
                  position: 'absolute', top: 0, left: 'calc(50% - 15px)',
                  width: '30px', height: '2px',
                  background: 'linear-gradient(90deg, #16a34a, #4afa82)',
                  borderRadius: '0 0 4px 4px',
                  boxShadow: '0 0 8px #4afa82',
                }} />
              )}

              <motion.div
                style={{ position: 'relative' }}
                animate={{ y: isActive ? -2 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <Icon
                  size={22}
                  color={isActive ? '#4afa82' : 'rgba(255,255,255,0.45)'}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
                <AnimatePresence>
                {count !== undefined && count > 0 && (
                  <motion.span
                    key={count}
                    initial={{ scale: 0.3 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 15 }}
                    style={{
                    position: 'absolute', top: '-6px', right: '-8px',
                    background: '#4afa82', color: '#000',
                    fontSize: '9px', fontWeight: 800,
                    borderRadius: '50%', width: '16px', height: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    {count > 9 ? '9+' : count}
                  </motion.span>
                )}
                </AnimatePresence>
              </motion.div>

              <span style={{
                fontSize: '10px',
                color: isActive ? '#4afa82' : 'rgba(255,255,255,0.4)',
                fontWeight: isActive ? 600 : 400,
                fontFamily: "'Inter', sans-serif",
              }}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
