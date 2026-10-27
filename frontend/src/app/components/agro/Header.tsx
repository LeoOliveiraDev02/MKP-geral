import { useEffect, useRef, useState } from 'react';
import {
  Search, ShoppingCart, Heart, User, Menu, X, Sprout, Phone, ChevronDown, LayoutGrid, Bell, MessageCircle, Tag,
  Home, ShoppingBasket, MapPin, Store,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { View } from '../../App';
import type { Category } from './data';
import { C, CONTAINER, FONT, HEADER_IMAGE } from './theme';
import { useApp } from '../../AppContext';
import { AnuncioService } from '../../api/services';
import { formatDateTime } from './ui';

type HeaderProps = {
  cartCount: number;
  favCount: number;
  currentView: View;
  categories: Category[];
  activeCategory: string | null;
  onNavigate: (view: View) => void;
  onSearch: (query: string) => void;
  onCategorySelect: (categoryId: string | null) => void;
  onLogout: () => void;
  isLoggedIn: boolean;
  userName?: string;
};

type Sugestoes = { produtos: string[]; categorias: Array<{ id: number; nome: string }> };

export function Header({
  cartCount,
  favCount,
  currentView,
  categories,
  activeCategory,
  onNavigate,
  onSearch,
  onCategorySelect,
  onLogout,
  isLoggedIn,
  userName,
}: HeaderProps) {
  const app = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const handleSearch = (texto = searchQuery) => {
    onSearch(texto);
  };

  const navLinks: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }[] = [
    { label: 'Início', active: currentView === 'home' && !activeCategory, onClick: () => onNavigate('home'), icon: <Home size={16} color={C.brown} /> },
    { label: 'Ofertas', active: currentView === 'offers', onClick: () => onNavigate('offers'), icon: <Tag size={16} color={C.orange} /> },
    { label: 'Cestas', active: currentView === 'baskets', onClick: () => onNavigate('baskets'), icon: <ShoppingBasket size={16} color={C.brown} /> },
    { label: 'Mapa de produtores', active: currentView === 'map', onClick: () => onNavigate('map'), icon: <MapPin size={16} color={C.brown} /> },
    { label: 'Anunciar', active: currentView === 'seller', onClick: () => onNavigate('seller'), icon: <Store size={16} color={C.brown} /> },
  ];

  const itensConta: { label: string; caminho: string; contador?: number }[] = [
    { label: 'Meus pedidos', caminho: '/pedidos' },
    { label: 'Mensagens', caminho: '/mensagens', contador: app.mensagensNaoLidas },
    { label: 'Cotações', caminho: '/cotacoes' },
    { label: 'Assinaturas de cestas', caminho: '/cestas?aba=assinaturas' },
    { label: 'Reclamações', caminho: '/reclamacoes' },
    { label: 'Favoritos', caminho: '/favoritos' },
    { label: 'Painel do vendedor', caminho: '/vender' },
    { label: 'Meu perfil', caminho: '/perfil' },
    ...(app.user?.is_admin ? [{ label: 'Administração', caminho: '/admin' }] : []),
  ];

  return (
    <>
      {/* Faixa principal com a paisagem do campo ao fundo */}
      <header
        style={{
          backgroundColor: C.graphite,
          backgroundImage: `linear-gradient(90deg, rgba(20,18,14,0.88) 0%, rgba(20,18,14,0.62) 45%, rgba(20,18,14,0.78) 100%), url(${HEADER_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 62%',
          fontFamily: FONT,
          // Acima da barra grafite fixa (zIndex 100): menus abertos daqui não ficam por baixo dela
          position: 'relative',
          zIndex: 110,
        }}
      >
        <div className={`${CONTAINER} py-3 md:py-5`}>
          <div className="flex items-center gap-3 md:gap-5 lg:gap-8">
            {/* Logo */}
            <button
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2.5 shrink-0"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
              aria-label="AgroMundo — página inicial"
            >
              <Sprout className="w-9 h-9 md:w-12 md:h-12" color="#fff" strokeWidth={1.8} />
              <div>
                <div className="text-[22px] md:text-[32px]" style={{ fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>
                  Agro<span style={{ color: C.orange }}>Mundo</span>
                </div>
                <div className="hidden sm:block md:hidden lg:block" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
                  Conectando o campo à sua mesa
                </div>
              </div>
            </button>

            {/* Busca (desktop) */}
            <div className="hidden md:block flex-1 min-w-0 max-w-[640px] mx-auto">
              <SearchField value={searchQuery} onChange={setSearchQuery} onSubmit={handleSearch} onCategoria={onCategorySelect} />
            </div>

            {/* Ações (desktop) */}
            <div className="hidden md:flex items-center gap-1 lg:gap-2 ml-auto">
              {isLoggedIn && (
                <>
                  <div className="relative">
                    <HeaderAction label="Avisos" count={app.naoLidas} icon={<Bell size={22} strokeWidth={1.7} />} onClick={() => setNotifOpen(v => !v)} />
                    <AnimatePresence>
                      {notifOpen && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setNotifOpen(false)} />
                          <PainelNotificacoes onFechar={() => setNotifOpen(false)} />
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                  <HeaderAction label="Mensagens" count={app.mensagensNaoLidas} icon={<MessageCircle size={22} strokeWidth={1.7} />} onClick={() => onNavigate('messages')} />
                </>
              )}
              <HeaderAction label="Favoritos" count={favCount} icon={<Heart size={22} strokeWidth={1.7} />} onClick={() => onNavigate('favorites')} />
              <HeaderAction label="Carrinho" count={cartCount} icon={<ShoppingCart size={22} strokeWidth={1.7} />} onClick={() => onNavigate('cart')} />

              <div className="relative">
                <HeaderAction
                  label={isLoggedIn ? (userName || 'Minha conta') : 'Entrar / Cadastrar'}
                  icon={<User size={22} strokeWidth={1.7} />}
                  onClick={() => (isLoggedIn ? setUserMenuOpen(v => !v) : onNavigate('auth'))}
                />
                <AnimatePresence>
                  {userMenuOpen && isLoggedIn && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setUserMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        style={{ ...dropdownStyle, right: 0, minWidth: '220px' }}
                      >
                        {itensConta.map(item => (
                          <DropdownItem
                            key={item.caminho}
                            label={item.label}
                            contador={item.contador}
                            onClick={() => { app.go(item.caminho); setUserMenuOpen(false); }}
                          />
                        ))}
                        <div style={{ borderTop: `1px solid ${C.border}`, margin: '6px 0' }} />
                        <DropdownItem label="Sair" onClick={() => { setUserMenuOpen(false); onLogout(); }} danger />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Ações (mobile) */}
            <div className="flex md:hidden items-center gap-1 ml-auto">
              {isLoggedIn && (
                <button onClick={() => { setNotifOpen(v => !v); setMobileMenuOpen(false); }} className="relative" style={iconButtonStyle} aria-label="Avisos">
                  <Bell size={23} color="#fff" strokeWidth={1.7} />
                  <CountBadge count={app.naoLidas} />
                </button>
              )}
              <button onClick={() => onNavigate('cart')} className="relative" style={iconButtonStyle} aria-label="Carrinho">
                <ShoppingCart size={23} color="#fff" strokeWidth={1.7} />
                <CountBadge count={cartCount} />
              </button>
              <button onClick={() => { setMobileMenuOpen(v => !v); setNotifOpen(false); }} style={iconButtonStyle} aria-label="Menu">
                {mobileMenuOpen ? <X size={24} color="#fff" /> : <Menu size={24} color="#fff" />}
              </button>
            </div>
          </div>

          {/* Busca (mobile) */}
          <div className="md:hidden mt-3">
            <SearchField value={searchQuery} onChange={setSearchQuery} onSubmit={handleSearch} onCategoria={onCategorySelect} />
          </div>
        </div>

        {/* Avisos (mobile) */}
        <AnimatePresence initial={false}>
          {notifOpen && (
            <motion.div
              className="md:hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', background: C.surface }}
            >
              <ListaNotificacoes onFechar={() => setNotifOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Menu mobile */}
        <AnimatePresence initial={false}>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="md:hidden"
              style={{ overflow: 'hidden', background: C.surface, borderTop: `1px solid ${C.border}` }}
            >
              <div className="flex flex-col p-3">
                {isLoggedIn ? (
                  <>
                    {itensConta.map(item => (
                      <DropdownItem
                        key={item.caminho}
                        label={item.label}
                        contador={item.contador}
                        onClick={() => { app.go(item.caminho); setMobileMenuOpen(false); }}
                      />
                    ))}
                    <DropdownItem label="Sair" onClick={() => { setMobileMenuOpen(false); onLogout(); }} danger />
                  </>
                ) : (
                  <DropdownItem label="Entrar / Cadastrar" onClick={() => { onNavigate('auth'); setMobileMenuOpen(false); }} />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Barra de navegação grafite (fixa ao rolar) */}
      <nav style={{ background: C.graphite, position: 'sticky', top: 0, zIndex: 100, fontFamily: FONT, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className={`${CONTAINER} flex items-center gap-2 md:gap-6`} style={{ height: '54px' }}>
          <div className="relative shrink-0">
            <button
              onClick={() => setCategoriesOpen(v => !v)}
              className="flex items-center gap-2.5"
              style={{
                background: C.graphiteSoft, border: 'none', borderRadius: '8px',
                padding: '9px 14px', color: '#fff', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT,
              }}
              aria-expanded={categoriesOpen}
            >
              <Menu size={18} />
              <span className="hidden sm:inline">Todas as categorias</span>
              <span className="sm:hidden">Categorias</span>
              <ChevronDown size={16} style={{ transition: 'transform .2s', transform: categoriesOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            <AnimatePresence>
              {categoriesOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setCategoriesOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    style={{ ...dropdownStyle, left: 0, minWidth: '240px', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}
                  >
                    {navLinks.map(link => (
                      <DropdownItem
                        key={link.label}
                        label={link.label}
                        icon={link.icon}
                        active={link.active}
                        onClick={() => { link.onClick(); setCategoriesOpen(false); }}
                      />
                    ))}
                    <div style={{ borderTop: `1px solid ${C.border}`, margin: '6px 0' }} />
                    <DropdownItem
                      label="Todas as categorias"
                      icon={<LayoutGrid size={16} color={C.brown} />}
                      onClick={() => { onCategorySelect(null); setCategoriesOpen(false); }}
                    />
                    {categories.map(cat => (
                      <DropdownItem
                        key={cat.id}
                        label={cat.name}
                        icon={<cat.icon size={16} color={C.brown} />}
                        active={activeCategory === cat.id}
                        onClick={() => { onCategorySelect(cat.id); setCategoriesOpen(false); }}
                      />
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden xl:flex items-center gap-2 ml-auto" style={{ color: 'rgba(255,255,255,0.82)', fontSize: '13px', whiteSpace: 'nowrap' }}>
            <Phone size={15} color={C.orange} />
            <span>0800 123 4567</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>•</span>
            <span>Seg–Sex 8h–18h</span>
          </div>
        </div>
      </nav>
    </>
  );
}

/** Campo de busca com sugestões (produtos e categorias) enquanto digita. */
function SearchField({ value, onChange, onSubmit, onCategoria }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (texto?: string) => void;
  onCategoria: (id: string | null) => void;
}) {
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(-1);
  const pedido = useRef(0);

  useEffect(() => {
    const termo = value.trim();
    if (termo.length < 2) {
      setSugestoes(null);
      return;
    }
    const n = ++pedido.current;
    const t = setTimeout(() => {
      AnuncioService.suggest(termo)
        .then(s => { if (n === pedido.current) setSugestoes(s); })
        .catch(() => undefined);
    }, 220);
    return () => clearTimeout(t);
  }, [value]);

  const opcoes = [
    ...(sugestoes?.produtos ?? []).map(p => ({ tipo: 'produto' as const, rotulo: p, acao: () => { onChange(p); onSubmit(p); } })),
    ...(sugestoes?.categorias ?? []).map(c => ({ tipo: 'categoria' as const, rotulo: c.nome, acao: () => onCategoria(String(c.id)) })),
  ];
  const mostrar = aberto && opcoes.length > 0;

  const escolher = (i: number) => {
    opcoes[i]?.acao();
    setAberto(false);
    setDestaque(-1);
  };

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (destaque >= 0) escolher(destaque); else { onSubmit(); setAberto(false); } }}
      className="relative"
      role="search"
    >
      <div className="flex items-center" style={{ background: C.surface, borderRadius: '12px', height: '46px', boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}>
        <input
          type="search"
          placeholder="Buscar produtos, produtores, categorias..."
          value={value}
          onChange={e => { onChange(e.target.value); setAberto(true); setDestaque(-1); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onKeyDown={e => {
            if (!mostrar) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque(d => Math.min(d + 1, opcoes.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque(d => Math.max(d - 1, -1)); }
            if (e.key === 'Escape') setAberto(false);
          }}
          aria-label="Buscar"
          aria-autocomplete="list"
          aria-expanded={mostrar}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            padding: '0 18px', color: C.text, fontSize: '14px', fontFamily: FONT,
          }}
        />
        <button type="submit" aria-label="Buscar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 16px', height: '100%', display: 'flex', alignItems: 'center' }}>
          <Search size={20} color={C.graphite} />
        </button>
      </div>
      {mostrar && (
        <div role="listbox" style={{ ...dropdownStyle, left: 0, right: 0, top: 'calc(100% + 6px)' }}>
          {opcoes.map((o, i) => (
            <button
              key={`${o.tipo}-${o.rotulo}`}
              type="button"
              role="option"
              aria-selected={i === destaque}
              onMouseDown={e => e.preventDefault()}
              onClick={() => escolher(i)}
              className="hover:bg-[#FCE7D2]/60"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '9px 12px',
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: C.text, fontFamily: FONT,
                background: i === destaque ? C.orangeSoft : undefined,
              }}
            >
              {o.tipo === 'produto' ? <Search size={15} color={C.muted} /> : <LayoutGrid size={15} color={C.brown} />}
              <span>{o.rotulo}</span>
              {o.tipo === 'categoria' && <span style={{ marginLeft: 'auto', fontSize: '12px', color: C.muted }}>categoria</span>}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

function PainelNotificacoes({ onFechar }: { onFechar: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      style={{ ...dropdownStyle, right: 0, width: '360px', padding: 0, overflow: 'hidden' }}
    >
      <ListaNotificacoes onFechar={onFechar} />
    </motion.div>
  );
}

function ListaNotificacoes({ onFechar }: { onFechar: () => void }) {
  const app = useApp();
  return (
    <div style={{ fontFamily: FONT }}>
      <div className="flex items-center justify-between" style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
        <strong style={{ fontSize: '14px', color: C.text }}>Avisos</strong>
        {app.naoLidas > 0 && (
          <button onClick={app.marcarTodasNotificacoes} style={{ background: 'none', border: 'none', color: C.orange, fontSize: '13px', cursor: 'pointer' }}>
            Marcar todos como lidos
          </button>
        )}
      </div>
      <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
        {app.notificacoes.length === 0 ? (
          <p style={{ padding: '24px 14px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>Nenhum aviso por enquanto.</p>
        ) : app.notificacoes.map(n => (
          <button
            key={n.id}
            onClick={() => {
              if (!n.lida) app.marcarNotificacao(n.id);
              if (n.link) app.go(n.link);
              onFechar();
            }}
            className="hover:bg-[#FCE7D2]/40"
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none',
              borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: FONT,
              background: n.lida ? undefined : 'rgba(244,119,11,0.06)',
            }}
          >
            <div className="flex items-start gap-2">
              {!n.lida && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.orange, marginTop: '6px', flexShrink: 0 }} />}
              <div className="min-w-0">
                <div style={{ fontSize: '13.5px', fontWeight: n.lida ? 500 : 600, color: C.text }}>{n.titulo}</div>
                {n.mensagem && <div style={{ fontSize: '12.5px', color: C.muted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.mensagem}</div>}
                <div style={{ fontSize: '11.5px', color: C.muted, marginTop: '3px' }}>{formatDateTime(n.data)}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HeaderAction({ label, count, icon, onClick }: { label: string; count?: number; icon: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.95 }}
      className="flex flex-col items-center gap-1 relative"
      aria-label={label}
      title={label}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: '4px 10px', fontFamily: FONT }}
    >
      <span className="relative" style={{ display: 'flex' }}>
        {icon}
        <CountBadge count={count} />
      </span>
      <span className="hidden lg:block" style={{ fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </motion.button>
  );
}

function CountBadge({ count }: { count?: number }) {
  return (
    <AnimatePresence>
      {count !== undefined && count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.3 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 15 }}
          style={{
            position: 'absolute', top: '-6px', right: '-9px',
            background: C.orange, color: '#fff', fontSize: '10px', fontWeight: 700,
            borderRadius: '999px', minWidth: '17px', height: '17px', padding: '0 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid rgba(20,18,14,0.6)',
          }}
        >
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function DropdownItem({ label, onClick, danger, icon, active, contador }: {
  label: string; onClick: () => void; danger?: boolean; icon?: React.ReactNode; active?: boolean; contador?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-[#FCE7D2]/60"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
        padding: '10px 12px', borderRadius: '8px', border: 'none',
        background: active ? C.orangeSoft : undefined, cursor: 'pointer',
        color: danger ? C.danger : C.text, fontWeight: active ? 600 : 500,
        fontSize: '14px', fontFamily: FONT,
      }}
    >
      {icon}
      {label}
      {!!contador && (
        <span style={{ marginLeft: 'auto', background: C.orange, color: '#fff', borderRadius: '999px', fontSize: '11px', fontWeight: 700, padding: '1px 7px' }}>
          {contador}
        </span>
      )}
    </button>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 8px)', zIndex: 50,
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px',
  padding: '6px', boxShadow: '0 16px 40px rgba(37,37,34,0.16)',
};

const iconButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', position: 'relative',
};
