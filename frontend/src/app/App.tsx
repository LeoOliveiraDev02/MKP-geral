import { useCallback, useEffect, useState } from 'react';
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
import { Product, CartItem, Category } from './components/agro/data';
import { AutenticacaoService, CategoriaService, FavoritoService, UsuarioService } from './api/services';
import { ApiError, getErrorMessage, setUnauthorizedHandler, tokenStorage } from './api/client';
import { categoriaToCategory } from './api/mappers';
import type { Usuario } from './api/types';

export type View = 'home' | 'product' | 'auth' | 'seller' | 'cart' | 'favorites' | 'profile';

// Transição padrão entre páginas: fade + leve deslize vertical.
const pageTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
} as const;

export default function App() {
  const [view, setView] = useState<View>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [user, setUser] = useState<Usuario | null>(null);
  // View que o usuário tentou abrir antes de ser mandado ao login.
  const [afterLogin, setAfterLogin] = useState<View>('home');

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const clearSession = useCallback(() => {
    setUser(null);
    setFavorites([]);
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const favs = await FavoritoService.list();
      setFavorites(favs.map(f => String(f.anuncio_id)));
    } catch {
      // Falha ao carregar favoritos não impede o uso do app.
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
        .catch(() => clearSession());
    }

    return () => setUnauthorizedHandler(null);
  }, [clearSession, loadFavorites]);

  useEffect(() => {
    CategoriaService.list()
      .then(cats => setCategories(cats.map(categoriaToCategory)))
      .catch(err => toast.error(getErrorMessage(err)));
  }, []);

  const requireAuth = (target: View) => {
    setAfterLogin(target);
    setView('auth');
    scrollTop();
  };

  const handleNavigate = (v: View) => {
    if ((v === 'seller' || v === 'favorites' || v === 'profile') && !user) {
      requireAuth(v);
      return;
    }
    setView(v);
    scrollTop();
  };

  const handleProductClick = (product: Product | { id: string }) => {
    setSelectedProductId(product.id);
    setView('product');
    scrollTop();
  };

  const handleAddToCart = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  // RN17: só usuário autenticado favorita. Estado final vem do backend (toggle).
  const handleFavorite = async (id: string) => {
    if (!user) {
      toast.info('Entre na sua conta para favoritar anúncios.');
      requireAuth(view);
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
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setActiveCategory(null);
    setView('home');
    scrollTop();
  };

  const handleCategorySelect = (categoryId: string | null) => {
    setActiveCategory(categoryId);
    setSearchQuery('');
    setView('home');
    scrollTop();
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCartItems(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleLogin = (usuario: Usuario) => {
    setUser(usuario);
    loadFavorites();
    setView(afterLogin === 'auth' ? 'home' : afterLogin);
    setAfterLogin('home');
    scrollTop();
  };

  const handleLogout = async () => {
    try {
      await AutenticacaoService.logout();
    } catch {
      // Token já inválido no servidor: a sessão local é encerrada do mesmo jeito.
    }
    clearSession();
    setView('home');
    toast.success('Sessão encerrada com sucesso.');
    scrollTop();
  };

  // PUT /users/profile não devolve data_cadastro: preserva os campos que já tínhamos.
  const handleUserUpdate = (usuario: Usuario) => {
    setUser(prev => (prev ? { ...prev, ...usuario } : usuario));
  };

  const handleAccountDeleted = () => {
    clearSession();
    setView('home');
    toast.success('Sua conta foi excluída.');
    scrollTop();
  };

  const handleBack = () => {
    setView('home');
    scrollTop();
  };

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <MotionConfig reducedMotion="user">
    <div
      style={{
        minHeight: '100vh',
        background: '#040e07',
        fontFamily: "'Inter', 'Space Grotesk', sans-serif",
        paddingBottom: '72px', // space for mobile nav
      }}
    >
      <Toaster theme="dark" position="top-right" richColors />

      {/* Auth page has its own full-page layout */}
      <AnimatePresence mode="wait" initial={false}>
      {view === 'auth' ? (
        <motion.div key="auth" {...pageTransition}>
          <AuthPage onBack={handleBack} onLogin={handleLogin} />
        </motion.div>
      ) : (
        <motion.div key="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
          <Header
            cartCount={cartCount}
            favCount={favorites.length}
            currentView={view}
            onNavigate={handleNavigate}
            onSearch={handleSearch}
            onLogout={handleLogout}
            isLoggedIn={!!user}
            userName={user?.nome}
          />

          <main>
            <AnimatePresence mode="wait">
            <motion.div key={view === 'product' ? `product-${selectedProductId}` : view} {...pageTransition}>
            {view === 'home' && (
              <HomePage
                categories={categories}
                favorites={favorites}
                onFavorite={handleFavorite}
                onAddToCart={handleAddToCart}
                onProductClick={handleProductClick}
                searchQuery={searchQuery}
                activeCategory={activeCategory}
                onCategoryChange={handleCategorySelect}
                onStartSelling={() => handleNavigate('seller')}
              />
            )}

            {view === 'product' && selectedProductId && (
              <ProductPage
                productId={selectedProductId}
                favorites={favorites}
                onFavorite={handleFavorite}
                onAddToCart={handleAddToCart}
                onBack={handleBack}
                onProductClick={handleProductClick}
              />
            )}

            {view === 'cart' && (
              <CartPage
                items={cartItems}
                onUpdateQuantity={handleUpdateCartQuantity}
                onRemove={handleRemoveFromCart}
                onBack={handleBack}
              />
            )}

            {view === 'favorites' && user && (
              <FavoritesPage
                onBack={handleBack}
                onProductClick={handleProductClick}
                onChange={setFavorites}
              />
            )}

            {view === 'seller' && user && (
              <SellerDashboard userName={user.nome} categories={categories} />
            )}

            {view === 'profile' && user && (
              <ProfilePage
                user={user}
                onBack={handleBack}
                onUserUpdate={handleUserUpdate}
                onLogout={handleLogout}
                onAccountDeleted={handleAccountDeleted}
              />
            )}
            </motion.div>
            </AnimatePresence>
          </main>

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
  );
}
