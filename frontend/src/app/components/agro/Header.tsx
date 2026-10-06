import { useState } from 'react';
import { Search, ShoppingCart, Heart, User, Menu, X, Leaf, Sprout, Phone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { View } from '../../App';

type HeaderProps = {
  cartCount: number;
  favCount: number;
  currentView: View;
  onNavigate: (view: View) => void;
  onSearch: (query: string) => void;
  onLogout: () => void;
  isLoggedIn: boolean;
  userName?: string;
};

export function Header({
  cartCount,
  favCount,
  currentView,
  onNavigate,
  onSearch,
  onLogout,
  isLoggedIn,
  userName,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  return (
    <header
      style={{
        background: 'rgba(4, 18, 8, 0.95)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(74, 250, 130, 0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          background: 'linear-gradient(90deg, #0a2e14, #0d3a1a)',
          borderBottom: '1px solid rgba(74, 250, 130, 0.1)',
          padding: '4px 0',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <span style={{ color: 'rgba(74, 250, 130, 0.8)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Sprout size={13} /> Bem-vindo ao maior marketplace do agronegócio brasileiro
          </span>
          <div className="hidden md:flex items-center gap-4" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Phone size={12} /> 0800 123 4567</span>
            <span>•</span>
            <span>Seg-Sex 8h–18h</span>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 shrink-0"
            style={{ textDecoration: 'none' }}
          >
            <motion.div
              whileHover={{ rotate: -12, scale: 1.08 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12 }}
              style={{
                width: '40px',
                height: '40px',
                background: 'linear-gradient(135deg, #16a34a, #4afa82)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(74, 250, 130, 0.4)',
              }}
            >
              <Leaf size={22} color="#fff" strokeWidth={2.5} />
            </motion.div>
            <div className="hidden sm:block">
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                Agro<span style={{ color: '#4afa82' }}>Mundo</span>
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(74, 250, 130, 0.7)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                Marketplace Agro
              </div>
            </div>
          </button>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex-1">
            <div
              className="flex items-center"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(74, 250, 130, 0.2)',
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}
            >
              <input
                type="text"
                placeholder="Buscar produtos, produtores, categorias..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: '14px',
                }}
              />
              <button
                type="submit"
                className="hidden md:flex"
                style={{
                  background: 'linear-gradient(135deg, #16a34a, #4afa82)',
                  border: 'none',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Search size={18} color="#fff" />
                <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>Buscar</span>
              </button>
            </div>
          </form>

          {/* Action buttons */}
          <div className="hidden md:flex items-center gap-1">
            <NavIconBtn label="Favoritos" count={favCount} onClick={() => onNavigate('favorites')} icon={<Heart size={20} />} active={currentView === 'favorites'} />
            <NavIconBtn label="Carrinho" count={cartCount} onClick={() => onNavigate('cart')} icon={<ShoppingCart size={20} />} active={currentView === 'cart'} />

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => {
                  if (isLoggedIn) setUserMenuOpen(v => !v);
                  else onNavigate('auth');
                }}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(74, 250, 130, 0.15)',
                  cursor: 'pointer',
                  minWidth: '60px',
                }}
              >
                <User size={20} color={isLoggedIn ? '#4afa82' : 'rgba(255,255,255,0.7)'} />
                <span style={{ fontSize: '11px', color: isLoggedIn ? '#4afa82' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
                  {isLoggedIn ? (userName || 'Perfil') : 'Entrar'}
                </span>
              </button>
              <AnimatePresence>
              {userMenuOpen && isLoggedIn && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  style={{
                    transformOrigin: 'top right',
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    background: 'rgba(10, 28, 14, 0.98)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(74, 250, 130, 0.2)',
                    borderRadius: '12px',
                    padding: '8px',
                    minWidth: '180px',
                    zIndex: 50,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                  }}
                >
                  <DropdownItem label="Meu Perfil" onClick={() => { onNavigate('profile'); setUserMenuOpen(false); }} />
                  <DropdownItem label="Meus Anúncios" onClick={() => { onNavigate('seller'); setUserMenuOpen(false); }} />
                  <DropdownItem label="Favoritos" onClick={() => { onNavigate('favorites'); setUserMenuOpen(false); }} />
                  <div style={{ borderTop: '1px solid rgba(74,250,130,0.1)', margin: '8px 0' }} />
                  <DropdownItem label="Sair" onClick={() => { setUserMenuOpen(false); onLogout(); }} danger />
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile icons */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => onNavigate('cart')}
              className="relative"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}
            >
              <ShoppingCart size={22} color="rgba(255,255,255,0.8)" />
              <AnimatePresence>
              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  initial={{ scale: 0.3 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 15 }}
                  style={{
                  position: 'absolute', top: 0, right: 0,
                  background: '#4afa82', color: '#000', fontSize: '10px',
                  fontWeight: 700, borderRadius: '50%', width: '16px', height: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {cartCount}
                </motion.span>
              )}
              </AnimatePresence>
            </button>
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={mobileMenuOpen ? 'close' : 'open'}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex' }}
                >
                  {mobileMenuOpen ? <X size={22} color="#fff" /> : <Menu size={22} color="#fff" />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence initial={false}>
      {mobileMenuOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{
            overflow: 'hidden',
            background: 'rgba(4, 18, 8, 0.98)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(74, 250, 130, 0.1)',
            padding: '16px',
          }}
        >
          <div className="flex flex-col gap-2">
            {isLoggedIn ? (
              <>
                <MobileMenuItem label="Meu Perfil" onClick={() => { onNavigate('profile'); setMobileMenuOpen(false); }} />
                <MobileMenuItem label="Meus Anúncios" onClick={() => { onNavigate('seller'); setMobileMenuOpen(false); }} />
                <MobileMenuItem label="Favoritos" onClick={() => { onNavigate('favorites'); setMobileMenuOpen(false); }} />
                <MobileMenuItem label="Sair" onClick={() => { setMobileMenuOpen(false); onLogout(); }} danger />
              </>
            ) : (
              <MobileMenuItem label="Entrar / Cadastrar" onClick={() => { onNavigate('auth'); setMobileMenuOpen(false); }} />
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

    </header>
  );
}

function NavIconBtn({ label, count, onClick, icon, active }: { label: string; count?: number; onClick: () => void; icon: React.ReactNode; active?: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl relative transition-colors"
      style={{
        background: active ? 'rgba(74, 250, 130, 0.1)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'rgba(74, 250, 130, 0.3)' : 'rgba(74, 250, 130, 0.1)'}`,
        cursor: 'pointer',
        minWidth: '60px',
      }}
    >
      <div style={{ color: active ? '#4afa82' : 'rgba(255,255,255,0.7)' }}>{icon}</div>
      <span style={{ fontSize: '11px', color: active ? '#4afa82' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{label}</span>
      <AnimatePresence>
      {count !== undefined && count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.3 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 15 }}
          style={{
          position: 'absolute', top: '4px', right: '4px',
          background: '#4afa82', color: '#000', fontSize: '10px',
          fontWeight: 700, borderRadius: '50%', width: '16px', height: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
      </AnimatePresence>
    </motion.button>
  );
}

function DropdownItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '8px 12px', borderRadius: '8px', border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: danger ? '#f87171' : 'rgba(255,255,255,0.8)',
        fontSize: '13px', fontFamily: "'Inter', sans-serif",
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74,250,130,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function MobileMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '12px 16px', borderRadius: '10px', border: 'none',
        background: danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.05)',
        cursor: 'pointer', color: danger ? '#f87171' : 'rgba(255,255,255,0.85)',
        fontSize: '15px', fontFamily: "'Inter', sans-serif",
      }}
    >
      {label}
    </button>
  );
}
