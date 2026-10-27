import { useEffect, useState } from 'react';
import {
  Heart, ShoppingCart, MapPin, Calendar, MessageCircle, ChevronLeft, ChevronRight, ChevronRight as Sep,
  Share2, Check, Wheat, Home, Camera, Tractor, Building2, Truck, ShieldCheck, CreditCard, Minus, Plus,
  LayoutGrid, User, Star, Handshake, Zap, Package, Scale, Award, ZoomIn, X, Play, Store, Send, Calculator, Boxes,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Product, formatCurrency, formatDate, porUnidade, UNIDADES, CERTIFICACOES } from './data';
import { ProductCard } from './ProductCard';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import {
  AnuncioService, AvaliacaoService, ChatService, CotacaoService, PedidoService, PerguntaService, ProdutorService,
} from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { buscarCep } from '../../api/viacep';
import { anuncioDetalheToProduct, anuncioResumoToProduct } from '../../api/mappers';
import type { Avaliacao, OpcaoEntrega, PerfilProdutor, Pergunta, ResumoAvaliacoes } from '../../api/types';
import { C, CONTAINER, FONT, SHADOW_SM } from './theme';
import {
  Estrelas, Modal, Pill, SeloVerificado, botaoContorno, botaoPrimario, botaoSecundario, campo, desabilitado, formatDateTime,
  imagemCover, rotulo,
} from './ui';
import { useApp } from '../../AppContext';
import { registrarVisto, sessaoId } from '../../lib/storage';

type ProductPageProps = {
  productId: string;
  favorites: string[];
  onFavorite: (id: string) => void;
  onAddToCart: (product: Product, quantidade?: number) => void;
  onBack: () => void;
  onProductClick: (product: Product) => void;
  onCategoryClick: (categoryId: string) => void;
};

type Tab = 'descricao' | 'info' | 'avaliacoes' | 'perguntas';

const MAX_THUMBS = 5;

/** Primeira frase da descrição, usada como chamada curta abaixo do título. */
function summary(description: string): string {
  const first = description.split(/(?<=[.!?])\s+/)[0] ?? '';
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

/** Id do vídeo do YouTube (watch?v=, youtu.be/, /embed/). */
function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{6,})/);
  return m ? m[1] : null;
}

function embedUrl(url: string): string | null {
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1` : null;
}

export function ProductPage({ productId, favorites, onFavorite, onAddToCart, onBack, onProductClick, onCategoryClick }: ProductPageProps) {
  const app = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [produtor, setProdutor] = useState<PerfilProdutor | null>(null);
  const [doProdutor, setDoProdutor] = useState<Product[]>([]);
  const [recomendados, setRecomendados] = useState<{ itens: Product[]; porVisitas: boolean }>({ itens: [], porVisitas: false });
  const [avaliacoes, setAvaliacoes] = useState<{ lista: Avaliacao[]; resumo: ResumoAvaliacoes } | null>(null);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [tab, setTab] = useState<Tab>('descricao');
  const [zoom, setZoom] = useState(false);
  const [video, setVideo] = useState(false);
  const [cotando, setCotando] = useState(false);

  // GET /ads/:id + produtor, avaliações, perguntas, mais do produtor e recomendações.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedImage(0);
    setQuantity(1);
    setTab(window.location.hash === '#avaliacoes' ? 'avaliacoes' : window.location.hash === '#perguntas' ? 'perguntas' : 'descricao');
    setProdutor(null);
    setDoProdutor([]);

    AnuncioService.get(productId)
      .then(detail => {
        if (cancelled) return;
        const p = anuncioDetalheToProduct(detail);
        setProduct(p);
        registrarVisto(p);
        AnuncioService.registrarEvento(p.id, 'VISUALIZACAO', sessaoId());

        ProdutorService.perfil(p.anuncianteId).then(r => { if (!cancelled) setProdutor(r); }).catch(() => undefined);
        AnuncioService.list({ anuncianteId: Number(p.anuncianteId), limit: 5, excluir: p.id })
          .then(r => { if (!cancelled) setDoProdutor(r.data.map(anuncioResumoToProduct).slice(0, 4)); })
          .catch(() => undefined);
        AnuncioService.recomendacoes(p.id)
          .then(r => { if (!cancelled) setRecomendados({ itens: r.anuncios.map(anuncioResumoToProduct).slice(0, 4), porVisitas: r.baseado_em_visitas }); })
          .catch(() => undefined);
      })
      .catch(err => { if (!cancelled) setError(getErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    AvaliacaoService.listar({ anuncioId: productId })
      .then(r => { if (!cancelled) setAvaliacoes({ lista: r.avaliacoes, resumo: r.resumo }); })
      .catch(() => undefined);
    PerguntaService.listar(productId).then(r => { if (!cancelled) setPerguntas(r); }).catch(() => undefined);

    return () => { cancelled = true; };
  }, [productId]);

  if (loading || error || !product) {
    return (
      <div style={{ background: C.bg, fontFamily: FONT }}>
        <div className={`${CONTAINER} py-5`}>
          <Breadcrumb onHome={onBack} />
          <div style={{ textAlign: 'center', padding: '100px 20px', color: error ? C.danger : C.muted }}>
            {error ? (
              <>
                <Wheat size={44} style={{ margin: '0 auto 14px' }} />
                <p style={{ fontSize: '17px' }}>{error}</p>
              </>
            ) : (
              <p style={{ fontSize: '15px' }}>Carregando anúncio...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isFavorite = favorites.includes(product.id);
  const images = product.images.length > 0 ? product.images : [product.image];
  const unidade = UNIDADES[product.unidade] ?? UNIDADES.un;
  const publishedAt = formatDate(product.publishedAt);
  const isRural = product.zona === 'RURAL';
  const zonaLabel = product.zona ? (isRural ? 'Rural' : 'Urbana') : null;
  const [city, uf] = product.location.split(', ');
  const semEstoque = product.estoque === 0;
  const maxQtd = product.estoque ?? 999;
  const proprio = !!app.user && String(app.user.id) === product.anuncianteId;
  const reputacao = produtor?.reputacao;
  const videoUrl = produtor?.produtor.video_url ?? null;

  // Preço unitário para a quantidade escolhida (oferta ou faixa de atacado)
  const faixaAtiva = [...(product.atacado ?? [])].reverse().find(f => quantity >= f.quantidade_minima && f.preco < product.precoEfetivo);
  const precoUnitario = faixaAtiva ? faixaAtiva.preco : product.precoEfetivo;

  const stepImage = (delta: number) => setSelectedImage(v => (v + delta + images.length) % images.length);

  const changeQuantity = (next: number) => {
    if (Number.isNaN(next)) return;
    setQuantity(Math.min(maxQtd, Math.max(1, Math.round(next))));
  };

  const handleAddToCart = () => {
    if (semEstoque) return;
    onAddToCart(product, quantity);
    setAdded(true);
    toast.success(`${quantity} ${unidade.curto} de ${product.name} no carrinho.`, {
      action: { label: 'Ver carrinho', onClick: () => app.go('/carrinho') },
    });
    setTimeout(() => setAdded(false), 2000);
  };

  const comprarAgora = () => {
    if (semEstoque) return;
    onAddToCart(product, quantity);
    if (!app.user) app.pedirLogin('/checkout');
    else app.go('/checkout');
  };

  const linkCompartilhar = `${import.meta.env.VITE_SHARE_URL || window.location.origin}/share/produto/${product.id}`;
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(linkCompartilhar);
      toast.success('Link copiado. Ao colar no WhatsApp, aparece a foto e o preço.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const conversar = async () => {
    if (!app.user) {
      app.pedirLogin();
      return;
    }
    try {
      const id = await ChatService.iniciar(product.id, `Olá! Tenho interesse em ${product.name}.`);
      app.go(`/mensagens/${id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const features = [
    product.zona && {
      icon: isRural ? Tractor : Building2,
      title: isRural ? 'Produção rural' : 'Produção urbana',
      text: isRural ? 'Direto do campo' : 'Cultivo urbano',
    },
    product.location && { icon: MapPin, title: 'Produção local', text: product.location },
    product.estoque !== null
      ? { icon: Package, title: semEstoque ? 'Sem estoque' : 'Em estoque', text: semEstoque ? 'Avise-me pelo chat' : `${product.estoque} ${unidade.curto} disponíveis` }
      : publishedAt && { icon: Calendar, title: 'Publicado em', text: publishedAt },
  ].filter(Boolean) as { icon: typeof MapPin; title: string; text: string }[];

  const specs = [
    { icon: LayoutGrid, label: 'Categoria', value: product.category },
    { icon: MapPin, label: 'Localização', value: product.location },
    zonaLabel && { icon: isRural ? Tractor : Building2, label: 'Zona', value: zonaLabel },
    { icon: User, label: 'Produtor', value: product.producer },
    { icon: Scale, label: 'Vendido por', value: unidade.longo },
    product.pesoKg && { icon: Boxes, label: 'Peso', value: `${product.pesoKg.toLocaleString('pt-BR')} kg por ${unidade.longo}` },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string }[];

  const visibleThumbs = images.slice(0, MAX_THUMBS);
  const hiddenCount = images.length - MAX_THUMBS;

  return (
    <div style={{ background: C.bg, fontFamily: FONT, color: C.text }}>
      <div className={`${CONTAINER} py-5 pb-28 md:pb-5`}>
        <Breadcrumb
          onHome={onBack}
          category={product.category}
          onCategory={() => onCategoryClick(product.categoryId)}
          current={product.name}
        />

        {/* Galeria · informações · produtor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_350px] gap-6 lg:gap-8 xl:gap-9 mt-4">
          {/* Galeria */}
          <section aria-label="Imagens do produto" className="min-w-0">
            <div className="relative" style={{ aspectRatio: '4 / 3', borderRadius: '14px', overflow: 'hidden', background: C.border }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.button
                  key={images[selectedImage]}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setZoom(true)}
                  aria-label="Ampliar foto"
                  style={{ position: 'absolute', inset: 0, border: 'none', padding: 0, cursor: 'zoom-in', background: 'none' }}
                >
                  <ImageWithFallback src={images[selectedImage]} alt={product.name} style={imagemCover} />
                </motion.button>
              </AnimatePresence>

              <div className="flex flex-wrap gap-2" style={{ position: 'absolute', top: '16px', left: '16px', pointerEvents: 'none' }}>
                {product.emOferta && (
                  <span style={{ ...pillStyle, position: 'static', background: C.orange, color: '#fff' }}>
                    <Zap size={15} /> OFERTA
                  </span>
                )}
                {product.zona && (
                  <span style={{ ...pillStyle, position: 'static', background: '#F9B95C', color: C.graphite }}>
                    {isRural ? <Tractor size={15} /> : <Building2 size={15} />}
                    {isRural ? 'PRODUÇÃO RURAL' : 'PRODUÇÃO URBANA'}
                  </span>
                )}
              </div>

              {images.length > 1 && (
                <>
                  <button onClick={() => stepImage(-1)} aria-label="Imagem anterior" style={arrowStyle('left')}>
                    <ChevronLeft size={22} />
                  </button>
                  <button onClick={() => stepImage(1)} aria-label="Próxima imagem" style={arrowStyle('right')}>
                    <ChevronRight size={22} />
                  </button>
                </>
              )}

              <span style={{ ...pillStyle, bottom: '16px', left: '16px', background: 'rgba(25,24,20,0.72)', color: '#fff', backdropFilter: 'blur(6px)', fontWeight: 500, pointerEvents: 'none' }}>
                <Camera size={15} /> Fotos do produtor
                {images.length > 1 && <span style={{ opacity: 0.7 }}>· {selectedImage + 1}/{images.length}</span>}
              </span>
              <span style={{ ...pillStyle, bottom: '16px', right: '16px', background: 'rgba(25,24,20,0.72)', color: '#fff', fontWeight: 500, pointerEvents: 'none' }}>
                <ZoomIn size={15} /> Ampliar
              </span>
            </div>

            {images.length > 1 && (
              <div className="grid gap-2 sm:gap-3 mt-3" style={{ gridTemplateColumns: `repeat(${MAX_THUMBS}, minmax(0, 1fr))` }}>
                {visibleThumbs.map((img, i) => {
                  const isLast = i === MAX_THUMBS - 1 && hiddenCount > 0;
                  const isActive = i === selectedImage || (isLast && selectedImage >= MAX_THUMBS);
                  return (
                    <button
                      key={img}
                      onClick={() => setSelectedImage(isLast && selectedImage >= MAX_THUMBS - 1 ? (selectedImage + 1) % images.length : i)}
                      aria-label={isLast ? `Ver mais ${hiddenCount} imagens` : `Imagem ${i + 1}`}
                      aria-current={isActive}
                      style={{
                        position: 'relative', aspectRatio: '4 / 3', padding: 0, cursor: 'pointer',
                        borderRadius: '10px', overflow: 'hidden', background: C.border,
                        border: `2px solid ${isActive ? C.orange : 'transparent'}`,
                        boxShadow: isActive ? `0 0 0 1px ${C.orange}` : 'none',
                        transition: 'border-color .15s',
                      }}
                    >
                      <ImageWithFallback src={img} alt="" style={imagemCover} />
                      {isLast && (
                        <span style={{ position: 'absolute', inset: 0, background: 'rgba(25,24,20,0.7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700 }}>
                          +{hiddenCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Informações e compra */}
          <section aria-label="Informações do produto" className="min-w-0 @container">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span style={{ background: C.orangeSoft, color: C.brown, fontSize: '12.5px', fontWeight: 600, padding: '4px 11px', borderRadius: '6px' }}>
                  {product.category}
                </span>
                {(product.certificacoes ?? []).map(c => (
                  <span key={c.tipo} title={c.numero ? `Registro ${c.numero} (declarado pelo produtor)` : 'Declarado pelo produtor'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F3E9DF', color: C.brown, fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px' }}>
                    <Award size={13} /> {CERTIFICACOES[c.tipo]}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${product.name} por ${formatCurrency(product.precoEfetivo)} no AgroMundo: ${linkCompartilhar}`)}`}
                  target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no WhatsApp" title="Compartilhar no WhatsApp"
                  style={{ ...iconBtn, width: '36px', height: '36px' }}
                >
                  <Send size={15} color={C.muted} />
                </a>
                <button onClick={handleShare} aria-label="Copiar link" title="Copiar link com prévia" style={{ ...iconBtn, width: '36px', height: '36px' }}>
                  <Share2 size={16} color={C.muted} />
                </button>
              </div>
            </div>

            <h1 style={{ fontSize: 'clamp(28px, 3.4vw, 42px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.8px', margin: '10px 0 8px' }}>
              {product.name}
            </h1>
            {product.totalAvaliacoes > 0 && product.notaMedia !== null && (
              <button onClick={() => { setTab('avaliacoes'); document.getElementById('detalhes')?.scrollIntoView({ behavior: 'smooth' }); }}
                className="flex items-center gap-2" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: '8px', fontFamily: FONT }}>
                <Estrelas nota={product.notaMedia} />
                <strong style={{ fontSize: '15px', color: C.text }}>{product.notaMedia.toLocaleString('pt-BR')}</strong>
                <span style={{ fontSize: '13.5px', color: C.muted }}>({product.totalAvaliacoes} {product.totalAvaliacoes === 1 ? 'avaliação' : 'avaliações'})</span>
              </button>
            )}
            {product.description && (
              <p style={{ fontSize: '16px', color: C.muted, lineHeight: 1.5, maxWidth: '520px' }}>{summary(product.description)}</p>
            )}

            {features.length > 0 && (
              <div className="grid grid-cols-1 @[29rem]:grid-cols-3 gap-3 @[29rem]:gap-0 mt-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
                {features.map(({ icon: Icon, title, text }, i) => (
                  <div key={title} className={`flex items-center gap-3 min-w-0 ${i > 0 ? '@[29rem]:border-l @[29rem]:pl-3' : ''} @[29rem]:pr-2`} style={{ borderColor: C.border }}>
                    <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={20} color={C.brown} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>{title}</div>
                      <div style={{ fontSize: '12px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Preço */}
            <div className="mt-5">
              {product.emOferta && product.precoPromocional !== null && (
                <div className="flex items-center gap-2" style={{ fontSize: '14px' }}>
                  <span style={{ textDecoration: 'line-through', color: C.muted }}>{formatCurrency(product.price)}</span>
                  <Pill tom="laranja">-{Math.round((1 - product.precoPromocional / product.price) * 100)}%</Pill>
                  {product.promocaoAte && <span style={{ color: C.muted, fontSize: '12.5px' }}>até {formatDate(product.promocaoAte)}</span>}
                </div>
              )}
              <div className="flex items-baseline gap-2">
                <span style={{ fontSize: 'clamp(32px, 3vw, 40px)', fontWeight: 800, color: C.orange, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  {formatCurrency(precoUnitario)}
                </span>
                <span style={{ fontSize: '15px', color: C.text, fontWeight: 500 }}>{porUnidade(product.unidade)}</span>
              </div>
              {faixaAtiva && (
                <div style={{ fontSize: '13px', color: C.success, fontWeight: 600, marginTop: '2px' }}>
                  Preço de atacado a partir de {faixaAtiva.quantidade_minima} {unidade.curto}
                </div>
              )}
            </div>

            {(product.atacado?.length ?? 0) > 0 && (
              <div style={{ marginTop: '12px', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', fontSize: '13px', maxWidth: '360px' }}>
                <div style={{ background: '#FBFAF7', padding: '7px 12px', fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>Preço por quantidade</div>
                {[{ quantidade_minima: 1, preco: product.precoEfetivo }, ...product.atacado!].map(f => (
                  <div key={f.quantidade_minima} className="flex justify-between" style={{
                    padding: '6px 12px', borderBottom: `1px solid ${C.border}`,
                    background: (faixaAtiva?.quantidade_minima ?? 1) === f.quantidade_minima ? 'rgba(244,119,11,0.06)' : undefined,
                  }}>
                    <span>{f.quantidade_minima === 1 ? '1' : `a partir de ${f.quantidade_minima}`} {unidade.curto}</span>
                    <strong>{formatCurrency(f.preco)}</strong>
                  </div>
                ))}
              </div>
            )}

            {/* Quantidade + carrinho + favorito */}
            {proprio ? (
              <div className="flex gap-2 mt-5" style={{ background: '#FBFAF7', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', fontSize: '14px' }}>
                <Store size={18} color={C.brown} /> Este é o seu anúncio.
                <button onClick={() => app.go('/vender/anuncios')} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>Gerenciar</button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap sm:flex-nowrap gap-3 mt-5">
                  <div className="flex items-center" style={{ border: `1px solid ${C.border}`, borderRadius: '10px', background: C.surface, height: '52px', opacity: semEstoque ? 0.5 : 1 }}>
                    <button onClick={() => changeQuantity(quantity - 1)} disabled={quantity <= 1 || semEstoque} aria-label="Diminuir quantidade" style={qtyBtn(quantity <= 1 || semEstoque)}>
                      <Minus size={18} />
                    </button>
                    <input
                      value={quantity}
                      onChange={e => changeQuantity(Number(e.target.value.replace(/\D/g, '') || 1))}
                      inputMode="numeric"
                      aria-label="Quantidade"
                      disabled={semEstoque}
                      style={{ width: '44px', textAlign: 'center', border: 'none', outline: 'none', fontSize: '16px', fontWeight: 600, color: C.text, background: 'transparent', fontFamily: FONT }}
                    />
                    <button onClick={() => changeQuantity(quantity + 1)} disabled={quantity >= maxQtd || semEstoque} aria-label="Aumentar quantidade" style={qtyBtn(quantity >= maxQtd || semEstoque)}>
                      <Plus size={18} />
                    </button>
                  </div>

                  <motion.button
                    onClick={handleAddToCart}
                    whileTap={{ scale: 0.98 }}
                    disabled={semEstoque}
                    className="flex-1 order-last sm:order-none basis-full sm:basis-auto"
                    style={{
                      height: '52px', minWidth: '200px', border: `1.5px solid ${C.orange}`, borderRadius: '10px', cursor: semEstoque ? 'not-allowed' : 'pointer',
                      background: added ? C.success : C.surface, color: added ? '#fff' : C.orange, fontSize: '15px', fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                      transition: 'background .2s', fontFamily: FONT, opacity: semEstoque ? 0.5 : 1,
                      borderColor: added ? C.success : C.orange,
                    }}
                  >
                    {added ? <Check size={20} /> : <ShoppingCart size={20} />}
                    {semEstoque ? 'Sem estoque' : added ? 'Adicionado' : 'Adicionar ao carrinho'}
                  </motion.button>

                  <button
                    onClick={() => onFavorite(product.id)}
                    aria-pressed={isFavorite}
                    aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    style={{ ...iconBtn, width: '52px', height: '52px', borderColor: isFavorite ? C.orange : C.border, background: isFavorite ? C.orangeSoft : C.surface }}
                  >
                    <Heart size={21} color={isFavorite ? C.orange : C.graphite} fill={isFavorite ? C.orange : 'none'} />
                  </button>
                </div>
                <button
                  onClick={comprarAgora}
                  disabled={semEstoque}
                  style={{ ...desabilitado(botaoPrimario, semEstoque), width: '100%', height: '52px', marginTop: '10px', fontSize: '15.5px' }}
                >
                  <Zap size={18} /> Comprar agora · {formatCurrency(precoUnitario * quantity)}
                </button>
                <button onClick={() => (app.user ? setCotando(true) : app.pedirLogin())} style={{ ...botaoSecundario, width: '100%', marginTop: '8px' }}>
                  <Boxes size={16} /> Comprar em quantidade? Pedir cotação ao produtor
                </button>
              </>
            )}

            <CalculadoraFrete product={product} quantidade={quantity} />

            {/* Entrega · segurança · pagamento */}
            <div className="grid grid-cols-1 @[29rem]:grid-cols-3 gap-4 @[29rem]:gap-0 mt-5 pb-6" style={{ borderBottom: `1px solid ${C.border}` }}>
              {[
                { icon: Truck, title: product.permiteEntrega ? 'Entrega' : 'Só retirada', text: product.permiteRetirada && product.permiteEntrega ? 'ou retirada grátis' : product.permiteEntrega ? 'Grátis acima de R$ 500' : 'no local do produtor' },
                { icon: ShieldCheck, title: 'Compra garantida', text: 'Reclamação e mediação' },
                { icon: CreditCard, title: 'Pagamento', text: 'Pix, cartão e boleto' },
              ].map(({ icon: Icon, title, text }, i) => (
                <div key={title} className={`flex items-center gap-3 ${i > 0 ? '@[29rem]:border-l @[29rem]:pl-3' : ''} @[29rem]:pr-2`} style={{ borderColor: C.border }}>
                  <Icon size={26} strokeWidth={1.4} color={C.graphite} style={{ flexShrink: 0 }} />
                  <div className="min-w-0">
                    <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap' }}>{title}</div>
                    <div style={{ fontSize: '11.5px', color: C.muted, whiteSpace: 'nowrap' }}>{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Produtor */}
          <aside aria-label="Produtor" className="lg:col-span-2 xl:col-span-1 min-w-0 flex flex-col gap-4">
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px', boxShadow: SHADOW_SM }}>
              <button onClick={() => app.go(`/produtor/${product.anuncianteId}`)} className="flex items-center gap-4 w-full"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: FONT, color: C.text }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                  background: `linear-gradient(135deg, ${C.brown}, #B07A4A)`, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700,
                  boxShadow: `0 0 0 3px ${C.surface}, 0 0 0 4px ${C.border}`,
                }}>
                  {product.vendedorFoto ? <ImageWithFallback src={product.vendedorFoto} alt="" style={imagemCover} /> : product.producerAvatar}
                </div>
                <div className="min-w-0">
                  <div style={{ fontSize: '19px', fontWeight: 700, lineHeight: 1.2 }}>{product.producer}</div>
                  {product.location && (
                    <div style={{ fontSize: '13px', color: C.muted, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={13} /> {product.location}
                    </div>
                  )}
                  {product.vendedorVerificado && <div style={{ marginTop: '6px' }}><SeloVerificado /></div>}
                </div>
              </button>

              <div className="grid grid-cols-3 mt-5 py-4" style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                {[
                  reputacao?.nota_media != null
                    ? { value: <span className="inline-flex items-center gap-1"><Star size={15} color={C.orange} fill={C.orange} />{reputacao.nota_media.toLocaleString('pt-BR')}</span>, label: `${reputacao.total_avaliacoes} avaliações` }
                    : { value: zonaLabel ?? '—', label: 'zona' },
                  { value: reputacao ? String(reputacao.vendas_concluidas) : '—', label: 'vendas concluídas' },
                  { value: reputacao && reputacao.nivel > 0 ? reputacao.rotulo : uf ?? '—', label: reputacao && reputacao.nivel > 0 ? 'reputação' : city ?? 'estado' },
                ].map((stat, i) => (
                  <div key={i} className={`text-center px-1 min-w-0 ${i > 0 ? 'border-l' : ''}`} style={{ borderColor: C.border }}>
                    <div style={{ fontSize: i === 2 ? '13.5px' : '17px', fontWeight: 700, lineHeight: '24px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.value}</div>
                    <div style={{ fontSize: '11.5px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {reputacao && reputacao.nivel > 0 && <Termometro nivel={reputacao.nivel} />}

              {!proprio && (
                <div className="flex flex-col gap-2 mt-4">
                  <button onClick={conversar} style={{ ...botaoContorno, width: '100%', height: '44px' }}>
                    <MessageCircle size={18} /> Conversar pelo site
                  </button>
                  {product.whatsappUrl && (
                    <a
                      href={product.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => AnuncioService.registrarEvento(product.id, 'CLIQUE_WHATSAPP', sessaoId())}
                      style={{ ...botaoSecundario, width: '100%', height: '42px', textDecoration: 'none' }}
                    >
                      Falar pelo WhatsApp
                    </a>
                  )}
                </div>
              )}
              <button onClick={() => app.go(`/produtor/${product.anuncianteId}`)} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 600, cursor: 'pointer', fontSize: '13.5px', marginTop: '12px', fontFamily: FONT }}>
                Ver página do produtor →
              </button>

              <div className="flex gap-3 mt-4" style={{ color: C.muted }}>
                <Handshake size={26} strokeWidth={1.4} color={C.brown} style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '13.5px', lineHeight: 1.6 }}>
                  Direto do produtor para você. Qualidade, confiança e o verdadeiro sabor do campo.
                </p>
              </div>
            </div>

            {videoUrl && embedUrl(videoUrl) && (
              <button onClick={() => setVideo(true)} className="flex items-stretch overflow-hidden"
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: 0, cursor: 'pointer', textAlign: 'left', boxShadow: SHADOW_SM, fontFamily: FONT }}>
                <div style={{ position: 'relative', width: '42%', minHeight: '110px', background: C.graphite }}>
                  {youtubeId(videoUrl) && <img src={`https://img.youtube.com/vi/${youtubeId(videoUrl)}/hqdefault.jpg`} alt="" style={imagemCover} />}
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(25,24,20,0.7)', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={18} color="#fff" fill="#fff" />
                    </span>
                  </span>
                </div>
                <div style={{ padding: '14px 16px', color: C.text }}>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>Conheça o produtor</div>
                  <div style={{ fontSize: '13px', color: C.muted, marginTop: '2px' }}>{product.producer}</div>
                  <div className="inline-flex items-center gap-2" style={{ ...botaoContorno, marginTop: '10px', padding: '6px 12px' }}><Play size={14} /> Assistir vídeo</div>
                </div>
              </button>
            )}
          </aside>
        </div>

        {/* Abas: descrição · informações · avaliações · perguntas */}
        <section className="mt-8" id="detalhes">
          <div role="tablist" className="flex gap-1 sm:gap-6 overflow-x-auto no-scrollbar" style={{ borderBottom: `1px solid ${C.border}` }}>
            {([
              ['descricao', 'Descrição'],
              ['info', 'Informações adicionais'],
              ['avaliacoes', `Avaliações (${avaliacoes?.resumo.total ?? product.totalAvaliacoes})`],
              ['perguntas', `Perguntas (${perguntas.length})`],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                id={id === 'avaliacoes' ? 'avaliacoes' : id === 'perguntas' ? 'perguntas' : undefined}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                style={{
                  position: 'relative', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  padding: '12px 4px', fontSize: '14.5px', fontFamily: FONT,
                  color: tab === id ? C.text : C.muted, fontWeight: tab === id ? 600 : 500,
                }}
              >
                {label}
                {tab === id && (
                  <motion.span layoutId="product-tab" style={{ position: 'absolute', left: 0, right: 0, bottom: '-1px', height: '3px', background: C.orange, borderRadius: '3px 3px 0 0' }} />
                )}
              </button>
            ))}
          </div>

          <div role="tabpanel" style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: 'clamp(18px, 2.4vw, 26px)' }}>
            {tab === 'descricao' && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-6 lg:gap-10">
                <div>
                  <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '12px' }}>Descrição do Produto</h2>
                  <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: '#3d3d39', lineHeight: 1.75, fontSize: '15px', whiteSpace: 'pre-line', maxWidth: '64ch' }}>
                    {product.description || 'O produtor ainda não cadastrou uma descrição para este anúncio.'}
                  </p>
                </div>
                <div style={{ background: '#FBFAF7', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px 18px' }}>
                  <h3 style={{ fontSize: '14.5px', fontWeight: 700, marginBottom: '14px' }}>Especificações</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4">
                    {specs.map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-start gap-2.5 px-3 min-w-0">
                        <Icon size={20} color={C.brown} strokeWidth={1.7} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div className="min-w-0">
                          <div style={{ fontSize: '11.5px', color: C.muted }}>{label}</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'info' && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10">
                {[
                  ['Código do anúncio', `#${product.id}`],
                  ['Publicado em', publishedAt ?? '—'],
                  ['Categoria', product.category],
                  ['Localização', product.location || '—'],
                  ['Zona', zonaLabel ?? '—'],
                  ['Vendido por', product.producer],
                  ['Unidade de venda', unidade.longo],
                  ['Estoque', product.estoque === null ? 'Sob consulta' : `${product.estoque} ${unidade.curto}`],
                  ['Peso', product.pesoKg ? `${product.pesoKg.toLocaleString('pt-BR')} kg` : '—'],
                  ['Entrega', product.permiteEntrega ? 'Sim' : 'Não'],
                  ['Retirada no local', product.permiteRetirada ? 'Sim' : 'Não'],
                  ...(product.certificacoes ?? []).map(c => [CERTIFICACOES[c.tipo], c.numero ? `nº ${c.numero}` : 'declarado']),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 py-3" style={{ borderBottom: `1px solid ${C.border}`, fontSize: '14px' }}>
                    <dt style={{ color: C.muted }}>{label}</dt>
                    <dd style={{ fontWeight: 600, textAlign: 'right' }}>{value}</dd>
                  </div>
                ))}
                {(product.certificacoes?.length ?? 0) > 0 && (
                  <p style={{ fontSize: '12px', color: C.muted, marginTop: '10px', gridColumn: '1 / -1' }}>
                    Certificações e registros sanitários são informados pelo produtor.
                  </p>
                )}
              </dl>
            )}

            {tab === 'avaliacoes' && (
              <SecaoAvaliacoes
                dados={avaliacoes}
                ehVendedor={proprio}
                onResposta={() => AvaliacaoService.listar({ anuncioId: product.id }).then(r => setAvaliacoes({ lista: r.avaliacoes, resumo: r.resumo }))}
              />
            )}

            {tab === 'perguntas' && (
              <SecaoPerguntas
                anuncioId={product.id}
                perguntas={perguntas}
                ehVendedor={proprio}
                onAtualizar={() => PerguntaService.listar(product.id).then(setPerguntas)}
              />
            )}
          </div>
        </section>

        {doProdutor.length > 0 && (
          <FaixaProdutos titulo={`Mais de ${product.producer}`} produtos={doProdutor} favorites={favorites} onFavorite={onFavorite}
            onAddToCart={onAddToCart} onProductClick={onProductClick}
            acao={{ rotulo: 'Ver todos', onClick: () => app.go(`/produtor/${product.anuncianteId}`) }} />
        )}

        {recomendados.itens.length > 0 && (
          <FaixaProdutos
            titulo={recomendados.porVisitas ? 'Quem viu este produto também viu' : 'Produtos relacionados'}
            produtos={recomendados.itens} favorites={favorites} onFavorite={onFavorite}
            onAddToCart={onAddToCart} onProductClick={onProductClick}
          />
        )}
      </div>

      {/* Barra de compra fixa no celular, acima da navegação inferior */}
      {!proprio && (
        <div
          className="md:hidden flex items-center gap-3"
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))', zIndex: 90,
            background: C.surface, borderTop: `1px solid ${C.border}`, padding: '10px 16px',
            boxShadow: '0 -6px 20px rgba(37,37,34,0.08)',
          }}
        >
          <div className="min-w-0">
            <div style={{ fontSize: '18px', fontWeight: 800, color: C.orange, lineHeight: 1.1 }}>{formatCurrency(precoUnitario)}</div>
            <div style={{ fontSize: '11.5px', color: C.muted }}>{quantity} {unidade.curto} · {porUnidade(product.unidade)}</div>
          </div>
          <button
            onClick={comprarAgora}
            disabled={semEstoque}
            style={{ ...desabilitado(botaoPrimario, semEstoque), marginLeft: 'auto', height: '46px', padding: '0 18px' }}
          >
            {semEstoque ? 'Sem estoque' : <><Zap size={17} /> Comprar</>}
          </button>
        </div>
      )}

      {/* Zoom da foto */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setZoom(false)}
            role="dialog" aria-label="Foto ampliada"
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,14,12,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          >
            <img src={images[selectedImage]} alt={product.name} onClick={e => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', cursor: 'zoom-out' }} />
            <button onClick={() => setZoom(false)} aria-label="Fechar" style={{ ...arrowStyle('right'), top: '32px', transform: 'none' }}><X size={22} /></button>
            {images.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); stepImage(-1); }} aria-label="Anterior" style={arrowStyle('left')}><ChevronLeft size={22} /></button>
                <button onClick={e => { e.stopPropagation(); stepImage(1); }} aria-label="Próxima" style={{ ...arrowStyle('right') }}><ChevronRight size={22} /></button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {video && videoUrl && (
        <Modal titulo={`Conheça ${product.producer}`} aberto onFechar={() => setVideo(false)} largura={860}>
          <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: '10px', overflow: 'hidden', background: '#000' }}>
            <iframe
              src={embedUrl(videoUrl)!}
              title="Vídeo do produtor"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
        </Modal>
      )}

      {cotando && (
        <ModalCotacao product={product} onFechar={() => setCotando(false)} />
      )}
    </div>
  );
}

/** Termômetro de reputação (1 a 5), no estilo dos grandes marketplaces. */
function Termometro({ nivel }: { nivel: number }) {
  const cores = ['#D64545', '#F08A3E', '#F2C14E', '#9BC25B', '#2E9E5B'];
  return (
    <div className="flex gap-1 mt-3" aria-label={`Reputação nível ${nivel} de 5`}>
      {cores.map((cor, i) => (
        <span key={cor} style={{ flex: 1, height: i + 1 === nivel ? '8px' : '5px', borderRadius: '4px', background: cor, opacity: i + 1 === nivel ? 1 : 0.25, alignSelf: 'center' }} />
      ))}
    </div>
  );
}

/** Estimativa de frete pelo CEP do comprador. */
function CalculadoraFrete({ product, quantidade }: { product: Product; quantidade: number }) {
  const [cep, setCep] = useState('');
  const [resultado, setResultado] = useState<{ cidade: string; uf: string; opcoes: OpcaoEntrega[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const calcular = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const destino = await buscarCep(cep);
      if (!destino) throw new Error('CEP não encontrado.');
      const r = await PedidoService.cotar([{ anuncioId: Number(product.id), quantidade }], { cidade: destino.cidade, uf: destino.uf });
      setResultado({ cidade: destino.cidade, uf: destino.uf, opcoes: r.grupos[0]?.opcoes ?? [] });
    } catch (err) {
      setResultado(null);
      setErro(getErrorMessage(err));
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ marginTop: '18px', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px', background: C.surface }}>
      <form onSubmit={calcular} className="flex flex-wrap items-center gap-2">
        <label htmlFor="cep-frete" className="flex items-center gap-2" style={{ fontSize: '13.5px', fontWeight: 600 }}>
          <Calculator size={16} color={C.brown} /> Calcular frete
        </label>
        <input
          id="cep-frete"
          value={cep}
          onChange={e => setCep(e.target.value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'))}
          placeholder="00000-000"
          inputMode="numeric"
          style={{ ...campo, width: '130px', padding: '8px 10px' }}
        />
        <button type="submit" disabled={cep.replace(/\D/g, '').length !== 8 || carregando} style={{ ...desabilitado(botaoSecundario, cep.replace(/\D/g, '').length !== 8 || carregando) }}>
          {carregando ? 'Calculando...' : 'OK'}
        </button>
        <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>
          Não sei meu CEP
        </a>
      </form>
      {erro && <p style={{ color: C.danger, fontSize: '13px', marginTop: '8px' }}>{erro}</p>}
      {resultado && (
        <div style={{ marginTop: '10px', fontSize: '13.5px' }}>
          <div style={{ color: C.muted, marginBottom: '4px' }}>Para {resultado.cidade}/{resultado.uf}:</div>
          {resultado.opcoes.map(o => (
            <div key={o.tipo} className="flex justify-between gap-3" style={{ padding: '4px 0' }}>
              <span>{o.tipo === 'ENTREGA' ? `Entrega em ${o.prazo_min} a ${o.prazo_max} dias úteis` : 'Retirar no local do produtor'}</span>
              <strong style={{ color: o.valor === 0 ? C.success : C.text }}>{o.valor === 0 ? 'Grátis' : formatCurrency(o.valor)}</strong>
            </div>
          ))}
          <div style={{ fontSize: '11.5px', color: C.muted, marginTop: '4px' }}>Estimativa do ambiente de teste (tabela por distância e peso).</div>
        </div>
      )}
    </div>
  );
}

function SecaoAvaliacoes({ dados, ehVendedor, onResposta }: {
  dados: { lista: Avaliacao[]; resumo: ResumoAvaliacoes } | null; ehVendedor: boolean; onResposta: () => void;
}) {
  const [respondendo, setRespondendo] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);

  if (!dados) return <p style={{ color: C.muted }}>Carregando avaliações...</p>;
  if (dados.resumo.total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 12px', color: C.muted }}>
        <Star size={34} color={C.orange} strokeWidth={1.5} style={{ margin: '0 auto 10px' }} />
        <p style={{ fontSize: '15px', fontWeight: 600, color: C.text }}>Este produto ainda não tem avaliações.</p>
        <p style={{ fontSize: '13px', marginTop: '4px' }}>Só quem comprou e recebeu o produto pode avaliar.</p>
      </div>
    );
  }

  const responder = async (id: number) => {
    try {
      await AvaliacaoService.responder(id, texto.trim());
      toast.success('Resposta publicada.');
      setRespondendo(null);
      setTexto('');
      onResposta();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-8">
      <div>
        <div style={{ fontSize: '44px', fontWeight: 800, lineHeight: 1 }}>{dados.resumo.media?.toLocaleString('pt-BR')}</div>
        <Estrelas nota={dados.resumo.media ?? 0} tamanho={18} />
        <div style={{ fontSize: '13px', color: C.muted, margin: '6px 0 14px' }}>{dados.resumo.total} avaliações de compradores</div>
        {([5, 4, 3, 2, 1] as const).map(n => {
          const qtd = dados.resumo.distribuicao[n];
          return (
            <div key={n} className="flex items-center gap-2" style={{ fontSize: '12.5px', marginBottom: '5px' }}>
              <span style={{ width: '14px' }}>{n}</span><Star size={12} color={C.orange} fill={C.orange} />
              <span style={{ flex: 1, height: '7px', background: C.border, borderRadius: '4px', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${(qtd / dados.resumo.total) * 100}%`, background: C.orange }} />
              </span>
              <span style={{ width: '22px', textAlign: 'right', color: C.muted }}>{qtd}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col">
        {dados.lista.map(a => (
          <article key={a.id} style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
            <div className="flex flex-wrap items-center gap-2">
              <Estrelas nota={a.nota} />
              <strong style={{ fontSize: '14px' }}>{a.autor_nome}</strong>
              <Pill tom="verde"><Check size={12} /> Compra verificada</Pill>
              <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>{formatDateTime(a.data)}</span>
            </div>
            {a.comentario && <p style={{ fontSize: '14px', marginTop: '8px', lineHeight: 1.6 }}>{a.comentario}</p>}
            {a.fotos.length > 0 && (
              <div className="flex gap-2 mt-2">
                {a.fotos.map(f => (
                  <button key={f} onClick={() => setFotoAberta(f)} style={{ width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: 'none', padding: 0, cursor: 'zoom-in' }}>
                    <ImageWithFallback src={f} alt="Foto do comprador" style={imagemCover} />
                  </button>
                ))}
              </div>
            )}
            {a.resposta_vendedor && (
              <div style={{ marginTop: '10px', background: '#FBFAF7', borderLeft: `3px solid ${C.orange}`, padding: '8px 12px', fontSize: '13.5px', borderRadius: 0 }}>
                <strong style={{ color: C.brown }}>Resposta do produtor:</strong> {a.resposta_vendedor}
              </div>
            )}
            {ehVendedor && !a.resposta_vendedor && (
              respondendo === a.id ? (
                <div className="flex gap-2 mt-2">
                  <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Agradeça ou esclareça..." style={campo} />
                  <button onClick={() => responder(a.id)} disabled={!texto.trim()} style={desabilitado(botaoPrimario, !texto.trim())}>Responder</button>
                </div>
              ) : (
                <button onClick={() => { setRespondendo(a.id); setTexto(''); }} style={{ background: 'none', border: 'none', color: C.orange, cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginTop: '6px', fontFamily: FONT }}>
                  Responder publicamente
                </button>
              )
            )}
          </article>
        ))}
      </div>
      {fotoAberta && (
        <Modal titulo="Foto do comprador" aberto onFechar={() => setFotoAberta(null)} largura={720}>
          <img src={fotoAberta} alt="" style={{ width: '100%', borderRadius: '8px' }} />
        </Modal>
      )}
    </div>
  );
}

function SecaoPerguntas({ anuncioId, perguntas, ehVendedor, onAtualizar }: {
  anuncioId: string; perguntas: Pergunta[]; ehVendedor: boolean; onAtualizar: () => void;
}) {
  const app = useApp();
  const [texto, setTexto] = useState('');
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);

  const perguntar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app.user) {
      app.pedirLogin();
      return;
    }
    setEnviando(true);
    try {
      await PerguntaService.perguntar(anuncioId, texto.trim());
      setTexto('');
      toast.success('Pergunta enviada. Você recebe um aviso quando o produtor responder.');
      onAtualizar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  const responder = async (id: number) => {
    try {
      await PerguntaService.responder(id, (respostas[id] || '').trim());
      toast.success('Resposta publicada.');
      onAtualizar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const excluir = async (id: number) => {
    try {
      await PerguntaService.excluir(id);
      onAtualizar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div>
      {!ehVendedor && (
        <form onSubmit={perguntar} className="flex flex-wrap gap-2 mb-5">
          <input value={texto} onChange={e => setTexto(e.target.value.slice(0, 500))} placeholder="Pergunte ao produtor (prazo, variedade, conservação...)"
            aria-label="Sua pergunta" style={{ ...campo, flex: 1, minWidth: '220px' }} />
          <button type="submit" disabled={texto.trim().length < 3 || enviando} style={desabilitado(botaoPrimario, texto.trim().length < 3 || enviando)}>
            Perguntar
          </button>
        </form>
      )}
      {perguntas.length === 0 ? (
        <p style={{ color: C.muted, fontSize: '14px' }}>Ninguém perguntou ainda. Seja o primeiro!</p>
      ) : (
        <div className="flex flex-col">
          {perguntas.map(p => (
            <div key={p.id} style={{ padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
              <div className="flex gap-2" style={{ fontSize: '14px' }}>
                <MessageCircle size={16} color={C.muted} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div className="flex-1">
                  <span>{p.texto}</span>
                  <div style={{ fontSize: '12px', color: C.muted }}>{p.autor_nome} · {formatDateTime(p.data_pergunta)}</div>
                </div>
                {app.user?.id === p.autor_id && (
                  <button onClick={() => excluir(p.id)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: '12px', cursor: 'pointer' }}>excluir</button>
                )}
              </div>
              {p.resposta ? (
                <div className="flex gap-2" style={{ fontSize: '14px', marginTop: '6px', marginLeft: '24px', color: '#4A4A45' }}>
                  <Store size={15} color={C.brown} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{p.resposta} <span style={{ fontSize: '12px', color: C.muted }}>· {formatDateTime(p.data_resposta)}</span></span>
                </div>
              ) : ehVendedor ? (
                <div className="flex gap-2" style={{ marginTop: '8px', marginLeft: '24px' }}>
                  <input value={respostas[p.id] ?? ''} onChange={e => setRespostas({ ...respostas, [p.id]: e.target.value })} placeholder="Sua resposta" style={campo} />
                  <button onClick={() => responder(p.id)} disabled={(respostas[p.id] ?? '').trim().length < 3}
                    style={desabilitado(botaoPrimario, (respostas[p.id] ?? '').trim().length < 3)}>Responder</button>
                </div>
              ) : (
                <div style={{ fontSize: '12.5px', color: C.muted, marginTop: '4px', marginLeft: '24px' }}>Aguardando resposta do produtor</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModalCotacao({ product, onFechar }: { product: Product; onFechar: () => void }) {
  const app = useApp();
  const [quantidade, setQuantidade] = useState(20);
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const unidade = UNIDADES[product.unidade] ?? UNIDADES.un;

  const enviar = async () => {
    setEnviando(true);
    try {
      await CotacaoService.solicitar(product.id, quantidade, mensagem.trim() || undefined);
      toast.success('Pedido de cotação enviado. Acompanhe em "Cotações".', { action: { label: 'Abrir', onClick: () => app.go('/cotacoes') } });
      onFechar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Pedir cotação de atacado" aberto onFechar={onFechar}>
      <p style={{ fontSize: '14px', color: C.muted, marginBottom: '14px' }}>
        Para restaurantes, mercados e compras grandes: o produtor responde com um preço por {unidade.longo} e um prazo. Se você aceitar, vira um pedido.
      </p>
      <label style={rotulo}>Quantidade ({unidade.curto})</label>
      <input type="number" min={1} value={quantidade} onChange={e => setQuantidade(Math.max(1, Number(e.target.value) || 1))} style={campo} />
      <label style={{ ...rotulo, marginTop: '14px' }}>Mensagem (opcional)</label>
      <textarea value={mensagem} onChange={e => setMensagem(e.target.value.slice(0, 1000))} rows={3} style={{ ...campo, resize: 'vertical' }}
        placeholder="Ex.: entrega semanal para restaurante, preciso de nota fiscal..." />
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onFechar} style={botaoSecundario}>Cancelar</button>
        <button onClick={enviar} disabled={enviando} style={desabilitado(botaoPrimario, enviando)}>Enviar pedido de cotação</button>
      </div>
    </Modal>
  );
}

function FaixaProdutos({ titulo, produtos, favorites, onFavorite, onAddToCart, onProductClick, acao }: {
  titulo: string; produtos: Product[]; favorites: string[]; onFavorite: (id: string) => void;
  onAddToCart: (p: Product) => void; onProductClick: (p: Product) => void; acao?: { rotulo: string; onClick: () => void };
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontSize: '21px', fontWeight: 700 }}>{titulo}</h2>
        {acao && <button onClick={acao.onClick} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>{acao.rotulo} →</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
        {produtos.map((p, i) => (
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
  );
}

function Breadcrumb({ onHome, category, onCategory, current }: { onHome: () => void; category?: string; onCategory?: () => void; current?: string }) {
  const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.text, fontSize: '13.5px', fontFamily: FONT };
  return (
    <nav aria-label="Você está em" className="flex items-center gap-2.5 flex-wrap" style={{ fontSize: '13.5px', color: C.muted }}>
      <button onClick={onHome} aria-label="Início" style={{ ...link, display: 'flex' }}><Home size={18} /></button>
      <span style={{ width: '1px', height: '14px', background: C.border }} />
      <button onClick={onHome} className="hover:text-[#F4770B]" style={link}>Início</button>
      {category && (
        <>
          <Sep size={14} />
          <button onClick={onCategory} className="hover:text-[#F4770B]" style={link}>{category}</button>
        </>
      )}
      {current && (
        <>
          <Sep size={14} />
          <span aria-current="page" style={{ color: C.text, fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current}</span>
        </>
      )}
    </nav>
  );
}

const pillStyle: React.CSSProperties = {
  position: 'absolute', display: 'inline-flex', alignItems: 'center', gap: '7px',
  padding: '7px 13px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2px',
};

function arrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', [side]: '16px', top: '50%', transform: 'translateY(-50%)',
    width: '42px', height: '42px', borderRadius: '50%', cursor: 'pointer',
    background: 'rgba(25,24,20,0.6)', border: '1.5px solid rgba(255,255,255,0.85)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
  };
}

const iconBtn: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s',
};

function qtyBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '44px', height: '100%', background: 'none', border: 'none',
    color: disabled ? C.border : C.graphite, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}
