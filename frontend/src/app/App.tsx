import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Header } from './components/agro/Header';
import { HomePage } from './components/agro/HomePage';
import { ProductPage } from './components/agro/ProductPage';
import { AuthPage } from './components/agro/AuthPage';
import { SellerDashboard } from './components/agro/SellerDashboard';
import { CartPage } from './components/agro/CartPage';
import { FavoritesPage } from './components/agro/FavoritesPage';
import { ProfilePage } from './components/agro/ProfilePage';
import { MobileNav } from './components/agro/MobileNav';
import { Footer } from './components/agro/Footer';
import { CheckoutPage } from './components/agro/CheckoutPage';
import { OrdersPage } from './components/agro/OrdersPage';
import { OrderDetailPage } from './components/agro/OrderDetailPage';
import { ProducerPage } from './components/agro/ProducerPage';
import { MessagesPage } from './components/agro/MessagesPage';
import { ClaimsPage } from './components/agro/ClaimsPage';
import { QuotesPage } from './components/agro/QuotesPage';
import { BasketsPage } from './components/agro/BasketsPage';
import { MapPage } from './components/agro/MapPage';
import { AdminPage } from './components/agro/AdminPage';
import { PrivacyPage } from './components/agro/PrivacyPage';
import { EmptyState } from './components/agro/ui';
import { C, FONT } from './components/agro/theme';
import { Product, CartItem, Category } from './components/agro/data';
import { AppContext, type AppState } from './AppContext';
import { gravarCarrinho, lerCarrinho } from './lib/storage';
import {
  AutenticacaoService, CategoriaService, ChatService, FavoritoService, NotificacaoService, UsuarioService,
} from './api/services';
import { ApiError, getErrorMessage, setUnauthorizedHandler, tokenStorage } from './api/client';
import { categoriaToCategory } from './api/mappers';
import type { Notificacao, Usuario } from './api/types';

/** Áreas principais (cabeçalho e navegação inferior). */
export type View =
  | 'home' | 'product' | 'auth' | 'seller' | 'cart' | 'favorites' | 'profile'
  | 'orders' | 'messages' | 'offers' | 'baskets' | 'map' | 'admin' | 'other';

const PATHS: Record<Exclude<View, 'product' | 'other'>, string> = {
  home: '/',
  auth: '/entrar',
  seller: '/vender',
  cart: '/carrinho',
  favorites: '/favoritos',
  profile: '/perfil',
  orders: '/pedidos',
  messages: '/mensagens',
  offers: '/ofertas',
  baskets: '/cestas',
  map: '/mapa',
  admin: '/admin',
};

function viewDoCaminho(pathname: string): View {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/produto/')) return 'product';
  const achado = (Object.entries(PATHS) as [View, string][]).find(([, p]) => p !== '/' && pathname.startsWith(p));
  return achado ? achado[0] : 'other';
}

// Transição padrão entre páginas: fade + leve deslize vertical.
const pageTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
} as const;

const CONTADORES_MS = 30000;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [cartItems, setCartItems] = useState<CartItem[]>(() => lerCarrinho());
  const [favorites, setFavorites] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [user, setUser] = useState<Usuario | null>(null);
  const [sessionReady, setSessionReady] = useState(!tokenStorage.get());
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState(0);
  const userRef = useRef<Usuario | null>(null);
  userRef.current = user;

  const view = viewDoCaminho(location.pathname);
  const searchQuery = location.pathname === '/' ? searchParams.get('q') || '' : '';
  const activeCategory = location.pathname === '/' ? searchParams.get('categoria') : null;

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // Rola para o topo a cada troca de página (âncoras #secao rolam até a seção).
  useEffect(() => {
    if (location.hash) {
      const alvo = location.hash.slice(1);
      setTimeout(() => document.getElementById(alvo)?.scrollIntoView({ behavior: 'smooth' }), 400);
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [location.pathname, location.hash]);

  useEffect(() => { gravarCarrinho(cartItems); }, [cartItems]);

  const clearSession = useCallback(() => {
    setUser(null);
    setFavorites([]);
    setNotificacoes([]);
    setNaoLidas(0);
    setMensagensNaoLidas(0);
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const favs = await FavoritoService.list();
      setFavorites(favs.map(f => String(f.anuncio_id)));
    } catch {
      // Falha ao carregar favoritos não impede o uso do app.
    }
  }, []);

  const atualizarContadores = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const [n, msgs] = await Promise.all([NotificacaoService.listar(), ChatService.naoLidas()]);
      setNotificacoes(n.notificacoes);
      setNaoLidas(n.nao_lidas);
      setMensagensNaoLidas(msgs);
    } catch {
      // contadores são acessórios
    }
  }, []);

  // Sessão: restaura o usuário a partir do token salvo e reage a 401 da API.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      toast.error('Sua sessão expirou. Faça login novamente.');
    });

    if (tokenStorage.get()) {
      UsuarioService.getProfile()
        .then(usuario => {
          setUser(usuario);
          loadFavorites();
        })
        .catch(() => clearSession())
        .finally(() => setSessionReady(true));
    }

    return () => setUnauthorizedHandler(null);
  }, [clearSession, loadFavorites]);

  // Sininho e mensagens: atualiza ao logar, a cada 30 s e ao voltar para a aba.
  useEffect(() => {
    if (!user) return;
    atualizarContadores();
    const id = setInterval(atualizarContadores, CONTADORES_MS);
    const aoFocar = () => document.visibilityState === 'visible' && atualizarContadores();
    document.addEventListener('visibilitychange', aoFocar);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', aoFocar);
    };
  }, [user, atualizarContadores]);

  useEffect(() => {
    CategoriaService.list()
      .then(cats => setCategories(cats.map(categoriaToCategory)))
      .catch(err => toast.error(getErrorMessage(err)));
  }, []);

  const go = useCallback((caminho: string) => navigate(caminho), [navigate]);

  const pedirLogin = useCallback((destino?: string) => {
    const volta = destino ?? `${location.pathname}${location.search}`;
    navigate(`/entrar?voltar=${encodeURIComponent(volta)}`);
  }, [navigate, location.pathname, location.search]);

  const handleNavigate = (v: View) => {
    if (v === 'product' || v === 'other') return;
    navigate(PATHS[v]);
  };

  const handleProductClick = (product: Product | { id: string }) => navigate(`/produto/${product.id}`);

  // Carrinho: soma quantidades sem ultrapassar o estoque conhecido do anúncio.
  const adicionarAoCarrinho = useCallback((product: Product, quantidade = 1) => {
    setCartItems(prev => {
      const existente = prev.find(item => item.product.id === product.id);
      const limite = product.estoque ?? Infinity;
      const nova = Math.min((existente?.quantity ?? 0) + quantidade, limite);
      if (nova <= 0) {
        toast.error(`${product.name} está sem estoque.`);
        return prev;
      }
      if (existente) {
        return prev.map(item => (item.product.id === product.id ? { product, quantity: nova } : item));
      }
      return [...prev, { product, quantity: nova }];
    });
  }, []);

  const atualizarCarrinho = useCallback((productId: string, quantity: number) => {
    setCartItems(prev =>
      quantity <= 0
        ? prev.filter(item => item.product.id !== productId)
        : prev.map(item => {
            if (item.product.id !== productId) return item;
            const limite = item.product.estoque ?? Infinity;
            return { ...item, quantity: Math.min(quantity, limite) };
          })
    );
  }, []);

  const removerDoCarrinho = useCallback((productId: string) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  // RN17: só usuário autenticado favorita. Estado final vem do backend (toggle).
  const handleFavorite = useCallback(async (id: string) => {
    if (!userRef.current) {
      toast.info('Entre na sua conta para favoritar anúncios.');
      pedirLogin();
      return;
    }
    try {
      const { favoritado } = await FavoritoService.toggle(id);
      setFavorites(prev => {
        const without = prev.filter(f => f !== id);
        return favoritado ? [...without, id] : without;
      });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) toast.error(getErrorMessage(err));
    }
  }, [pedirLogin]);

  const handleSearch = (query: string) => {
    navigate(query.trim() ? `/?q=${encodeURIComponent(query.trim())}#produtos` : '/');
  };

  const handleCategorySelect = (categoryId: string | null) => {
    navigate(categoryId ? `/?categoria=${categoryId}#produtos` : '/#produtos');
  };

  const handleLogin = async (usuario: Usuario) => {
    setUser(usuario);
    loadFavorites();
    // O login não traz is_admin: completa com o perfil
    UsuarioService.getProfile().then(setUser).catch(() => undefined);
    const voltar = searchParams.get('voltar');
    navigate(voltar && voltar.startsWith('/') && !voltar.startsWith('/entrar') ? voltar : '/');
  };

  const handleLogout = async () => {
    try {
      await AutenticacaoService.logout();
    } catch {
      // Token já inválido no servidor: a sessão local é encerrada do mesmo jeito.
    }
    clearSession();
    navigate('/');
    toast.success('Sessão encerrada com sucesso.');
  };

  // PUT /users/profile não devolve data_cadastro: preserva os campos que já tínhamos.
  const handleUserUpdate = (usuario: Usuario) => {
    setUser(prev => (prev ? { ...prev, ...usuario } : usuario));
  };

  const handleAccountDeleted = () => {
    clearSession();
    navigate('/');
    toast.success('Sua conta foi excluída.');
  };

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const marcarNotificacao = useCallback((id: number) => {
    setNotificacoes(prev => prev.map(n => (n.id === id ? { ...n, lida: true } : n)));
    setNaoLidas(prev => Math.max(0, prev - 1));
    NotificacaoService.marcarLida(id).catch(() => undefined);
  }, []);

  const marcarTodasNotificacoes = useCallback(() => {
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
    setNaoLidas(0);
    NotificacaoService.marcarTodasLidas().catch(() => undefined);
  }, []);

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const contexto: AppState = useMemo(() => ({
    user,
    sessionReady,
    categories,
    favorites,
    toggleFavorite: handleFavorite,
    setFavorites,
    carrinho: {
      itens: cartItems,
      adicionar: adicionarAoCarrinho,
      atualizar: atualizarCarrinho,
      remover: removerDoCarrinho,
      limpar: () => setCartItems([]),
      totalItens: cartCount,
    },
    notificacoes,
    naoLidas,
    mensagensNaoLidas,
    atualizarContadores,
    marcarNotificacao,
    marcarTodasNotificacoes,
    pedirLogin,
    go,
  }), [
    user, sessionReady, categories, favorites, handleFavorite, cartItems, adicionarAoCarrinho, atualizarCarrinho,
    removerDoCarrinho, cartCount, notificacoes, naoLidas, mensagensNaoLidas, atualizarContadores,
    marcarNotificacao, marcarTodasNotificacoes, pedirLogin, go,
  ]);

  /** Rotas que exigem login: espera a sessão restaurar e manda para /entrar se preciso. */
  const protegida = (pagina: ReactNode, apenasAdmin = false) => {
    if (!sessionReady) return <Carregando />;
    if (!user) {
      return <Navigate to={`/entrar?voltar=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    }
    if (apenasAdmin && !user.is_admin) {
      return <EmptyState titulo="Área restrita" texto="Esta página é só para a administração do AgroMundo." />;
    }
    return pagina;
  };

  const isAuth = location.pathname === '/entrar';
  // Abas do painel do vendedor trocam sem animar a página inteira (preserva o formulário)
  const chavePagina = location.pathname.startsWith('/vender') && !location.pathname.startsWith('/vender/pedidos/')
    ? '/vender'
    : location.pathname.split('/').slice(0, 3).join('/');

  return (
    <AppContext.Provider value={contexto}>
    <MotionConfig reducedMotion="user">
    <div
      className="pb-[72px] md:pb-0" // espaço da navegação inferior no celular
      style={{
        minHeight: '100vh',
        background: C.bg,
        fontFamily: FONT,
      }}
    >
      <Toaster theme="light" position="top-right" richColors />

      {/* Auth page has its own full-page layout */}
      <AnimatePresence mode="wait" initial={false}>
      {isAuth ? (
        <motion.div key="auth" {...pageTransition}>
          <AuthPage onBack={handleBack} onLogin={handleLogin} />
        </motion.div>
      ) : (
        <motion.div key="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
          <Header
            cartCount={cartCount}
            favCount={favorites.length}
            currentView={view}
            categories={categories}
            activeCategory={activeCategory}
            onNavigate={handleNavigate}
            onSearch={handleSearch}
            onCategorySelect={handleCategorySelect}
            onLogout={handleLogout}
            isLoggedIn={!!user}
            userName={user?.nome}
          />

          <main>
            <AnimatePresence mode="wait">
            <motion.div key={chavePagina} {...pageTransition}>
            <Routes location={location}>
              <Route path="/" element={
                <HomePage
                  categories={categories}
                  favorites={favorites}
                  onFavorite={handleFavorite}
                  onAddToCart={adicionarAoCarrinho}
                  onProductClick={handleProductClick}
                  searchQuery={searchQuery}
                  activeCategory={activeCategory}
                  onCategoryChange={handleCategorySelect}
                  onStartSelling={() => navigate('/vender')}
                />
              } />
              <Route path="/ofertas" element={
                <HomePage
                  categories={categories}
                  favorites={favorites}
                  onFavorite={handleFavorite}
                  onAddToCart={adicionarAoCarrinho}
                  onProductClick={handleProductClick}
                  searchQuery=""
                  activeCategory={null}
                  onCategoryChange={handleCategorySelect}
                  onStartSelling={() => navigate('/vender')}
                  somenteOfertas
                />
              } />
              <Route path="/produto/:id" element={
                <RotaProduto
                  favorites={favorites}
                  onFavorite={handleFavorite}
                  onAddToCart={adicionarAoCarrinho}
                  onBack={() => navigate('/')}
                  onProductClick={handleProductClick}
                  onCategoryClick={handleCategorySelect}
                />
              } />
              <Route path="/produtor/:id" element={<ProducerPage />} />
              <Route path="/carrinho" element={
                <CartPage
                  items={cartItems}
                  onUpdateQuantity={atualizarCarrinho}
                  onRemove={removerDoCarrinho}
                  onBack={handleBack}
                />
              } />
              <Route path="/checkout" element={protegida(<CheckoutPage />)} />
              <Route path="/pedidos" element={protegida(<OrdersPage />)} />
              <Route path="/pedidos/:id" element={protegida(<OrderDetailPage />)} />
              <Route path="/vender/pedidos/:id" element={protegida(<OrderDetailPage />)} />
              <Route path="/favoritos" element={protegida(
                <FavoritesPage onBack={handleBack} onProductClick={handleProductClick} onChange={setFavorites} />
              )} />
              <Route path="/vender/:aba?" element={protegida(user ? <SellerDashboard userName={user.nome} categories={categories} /> : null)} />
              <Route path="/perfil" element={protegida(user ? (
                <ProfilePage
                  user={user}
                  onBack={handleBack}
                  onUserUpdate={handleUserUpdate}
                  onLogout={handleLogout}
                  onAccountDeleted={handleAccountDeleted}
                />
              ) : null)} />
              <Route path="/perfil/verificacao" element={<Navigate to="/vender/perfil" replace />} />
              <Route path="/mensagens" element={protegida(<MessagesPage />)} />
              <Route path="/mensagens/:id" element={protegida(<MessagesPage />)} />
              <Route path="/reclamacoes" element={protegida(<ClaimsPage />)} />
              <Route path="/reclamacoes/:id" element={protegida(<ClaimsPage />)} />
              <Route path="/cotacoes" element={protegida(<QuotesPage />)} />
              <Route path="/cestas" element={<BasketsPage />} />
              <Route path="/assinaturas" element={<Navigate to="/cestas?aba=assinaturas" replace />} />
              <Route path="/mapa" element={<MapPage />} />
              <Route path="/privacidade" element={<PrivacyPage />} />
              <Route path="/admin" element={protegida(<AdminPage />, true)} />
              <Route path="*" element={
                <EmptyState
                  titulo="Página não encontrada"
                  texto="O endereço pode ter mudado ou o anúncio saiu do ar."
                  acao={{ rotulo: 'Voltar ao início', onClick: () => navigate('/') }}
                />
              } />
            </Routes>
            </motion.div>
            </AnimatePresence>
          </main>

          <Footer />

          <MobileNav
            currentView={view}
            onNavigate={handleNavigate}
            cartCount={cartCount}
            favCount={favorites.length}
            isLoggedIn={!!user}
          />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
    </MotionConfig>
    </AppContext.Provider>
  );
}

/** Lê o :id da URL para a página de produto. */
function RotaProduto(props: Omit<Parameters<typeof ProductPage>[0], 'productId'>) {
  const { id } = useParams();
  if (!id) return null;
  return <ProductPage {...props} productId={id} />;
}

function Carregando() {
  return <div style={{ padding: '120px 20px', textAlign: 'center', color: C.muted, fontFamily: FONT }}>Carregando...</div>;
}
