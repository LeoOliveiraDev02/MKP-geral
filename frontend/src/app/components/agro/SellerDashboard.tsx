import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package, PlusCircle, Edit, Trash2, Upload, X, BarChart2, MapPin, RotateCcw, Archive, ImagePlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Category, formatCurrency, formatDate } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { AnuncioService, EnderecoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { buscarCep } from '../../api/viacep';
import type { AnuncioResumo, Endereco, EnderecoInput, Imagem, Zona } from '../../api/types';
import { maskCep, onlyDigits } from '../../utils/masks';

type Tab = 'dashboard' | 'products' | 'add';
type StatusFiltro = 'ATIVO' | 'EM_LIXEIRA';

const NOVO_ENDERECO = 'novo';
const MAX_SECUNDARIAS = 5; // limite do Multer em anuncioRoutes (imagensSecundarias maxCount: 5)
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const EMPTY_ENDERECO: EnderecoInput = { rua: '', numero: '', bairro: '', cep: '', cidade: '', uf: '', zona: 'URBANA' };

const EMPTY_FORM = {
  nome: '',
  descricao: '',
  categoriaId: '',
  preco: '',
  enderecoId: '',
};

type SellerDashboardProps = {
  userName: string;
  categories: Category[];
};

export function SellerDashboard({ userName, categories }: SellerDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('ATIVO');

  const [anuncios, setAnuncios] = useState<AnuncioResumo[]>([]);
  const [totais, setTotais] = useState({ ativos: 0, lixeira: 0 });
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Formulário (criação e edição)
  const [editing, setEditing] = useState<AnuncioResumo | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [novoEndereco, setNovoEndereco] = useState<EnderecoInput>(EMPTY_ENDERECO);
  const [imagemPrincipal, setImagemPrincipal] = useState<File | null>(null);
  const [imagensSecundarias, setImagensSecundarias] = useState<File[]>([]);
  const [imagensAtuais, setImagensAtuais] = useState<Imagem[]>([]);
  const [deletarImagensIds, setDeletarImagensIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // GET /ads/me/products (lista do filtro atual) + totais dos dois status.
  const loadAnuncios = useCallback(async () => {
    setLoadingList(true);
    try {
      const [lista, ativos, lixeira] = await Promise.all([
        AnuncioService.myProducts({ status: statusFiltro, limit: 50 }),
        AnuncioService.myProducts({ status: 'ATIVO', limit: 1 }),
        AnuncioService.myProducts({ status: 'EM_LIXEIRA', limit: 1 }),
      ]);
      setAnuncios(lista.data);
      setTotais({ ativos: ativos.pagination.total, lixeira: lixeira.pagination.total });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoadingList(false);
    }
  }, [statusFiltro]);

  const loadEnderecos = useCallback(async () => {
    try {
      setEnderecos(await EnderecoService.list());
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, []);

  useEffect(() => { loadAnuncios(); }, [loadAnuncios]);
  useEffect(() => { loadEnderecos(); }, [loadEnderecos]);

  // Endereço padrão do formulário: o primeiro cadastrado, ou "novo" se não houver.
  useEffect(() => {
    if (!form.enderecoId && activeTab === 'add' && !editing) {
      setForm(prev => ({ ...prev, enderecoId: enderecos[0] ? String(enderecos[0].id) : NOVO_ENDERECO }));
    }
  }, [enderecos, activeTab, editing, form.enderecoId]);

  const previewPrincipal = useMemo(
    () => (imagemPrincipal ? URL.createObjectURL(imagemPrincipal) : null),
    [imagemPrincipal]
  );
  useEffect(() => () => { if (previewPrincipal) URL.revokeObjectURL(previewPrincipal); }, [previewPrincipal]);

  const update = (key: keyof typeof EMPTY_FORM, val: string) => setForm(prev => ({ ...prev, [key]: val }));
  const updateEndereco = (key: keyof EnderecoInput, val: string) => setNovoEndereco(prev => ({ ...prev, [key]: val }));

  const [buscandoCep, setBuscandoCep] = useState(false);

  const handleCepChange = async (value: string) => {
    const cep = maskCep(value);
    updateEndereco('cep', cep);
    if (onlyDigits(cep).length !== 8) return;

    setBuscandoCep(true);
    try {
      const endereco = await buscarCep(cep);
      if (!endereco) {
        toast.error('CEP não encontrado.');
        return;
      }
      // Ignora a resposta se o usuário já mudou o CEP enquanto a consulta rodava.
      setNovoEndereco(prev => prev.cep !== cep ? prev : {
        ...prev,
        rua: endereco.rua || prev.rua,
        bairro: endereco.bairro || prev.bairro,
        cidade: endereco.cidade || prev.cidade,
        uf: endereco.uf || prev.uf,
      });
    } catch {
      toast.error('Não foi possível consultar o CEP.');
    } finally {
      setBuscandoCep(false);
    }
  };

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNovoEndereco(EMPTY_ENDERECO);
    setImagemPrincipal(null);
    setImagensSecundarias([]);
    setImagensAtuais([]);
    setDeletarImagensIds([]);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setActiveTab('add');
  };

  const openEdit = async (ad: AnuncioResumo) => {
    resetForm();
    setEditing(ad);
    setForm({
      nome: ad.nome,
      descricao: ad.descricao,
      categoriaId: String(ad.categoria_id),
      preco: String(ad.preco),
      enderecoId: String(ad.endereco_id),
    });
    setActiveTab('add');
    try {
      // Galeria atual (GET /ads/:id) para permitir remover imagens secundárias.
      const detalhe = await AnuncioService.get(ad.id);
      setImagensAtuais(detalhe.imagens);
    } catch {
      setImagensAtuais([]);
    }
  };

  const handleRemove = async (ad: AnuncioResumo) => {
    if (!window.confirm(`Enviar "${ad.nome}" para a lixeira? Você poderá restaurá-lo em até 30 dias.`)) return;
    try {
      const message = await AnuncioService.remove(ad.id);
      toast.success(message ?? 'Anúncio enviado para a lixeira.');
      loadAnuncios();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleRestore = async (ad: AnuncioResumo) => {
    try {
      const message = await AnuncioService.restore(ad.id);
      toast.success(message ?? 'Anúncio restaurado.');
      loadAnuncios();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editing && !imagemPrincipal) {
      setFormError('Todo anúncio deve conter obrigatoriamente uma imagem principal.');
      return;
    }

    setSaving(true);
    try {
      const usarNovoEndereco = form.enderecoId === NOVO_ENDERECO;
      let enderecoId: string | undefined = usarNovoEndereco ? undefined : form.enderecoId;

      if (editing) {
        // PUT exige enderecoId existente: cadastra o novo endereço antes (POST /addresses).
        if (usarNovoEndereco) {
          const criado = await EnderecoService.create({ ...novoEndereco, cep: novoEndereco.cep || undefined });
          enderecoId = String(criado.id);
          loadEnderecos();
        }
        const { message } = await AnuncioService.update(editing.id, {
          nome: form.nome,
          descricao: form.descricao,
          preco: form.preco,
          categoriaId: form.categoriaId,
          enderecoId,
          imagemPrincipal,
          imagensSecundarias,
          deletarImagensIds,
        });
        toast.success(message ?? 'Anúncio atualizado com sucesso.');
      } else {
        // POST aceita o novo endereço inline e cria tudo numa transação só.
        const { message } = await AnuncioService.create({
          nome: form.nome,
          descricao: form.descricao,
          preco: form.preco,
          categoriaId: form.categoriaId,
          enderecoId,
          novoEndereco: usarNovoEndereco ? { ...novoEndereco, cep: novoEndereco.cep || undefined } : undefined,
          imagemPrincipal,
          imagensSecundarias,
        });
        toast.success(message ?? 'Anúncio publicado com sucesso.');
        if (usarNovoEndereco) loadEnderecos();
      }

      resetForm();
      setStatusFiltro('ATIVO');
      setActiveTab('products');
      loadAnuncios();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const enderecoLabel = (end: Endereco) =>
    `${end.rua}, ${end.numero} — ${end.bairro}, ${end.cidade}/${end.uf} (${end.zona})`;

  const tabs = [
    { tab: 'dashboard' as Tab, label: 'Resumo', icon: <BarChart2 size={18} /> },
    { tab: 'products' as Tab, label: 'Meus Anúncios', icon: <Package size={18} /> },
    { tab: 'add' as Tab, label: editing ? 'Editar Anúncio' : 'Novo Anúncio', icon: <PlusCircle size={18} /> },
  ];

  return (
    <div style={{ background: '#040e07', minHeight: '100vh', fontFamily: "'Inter', sans-serif", display: 'flex' }}>

      {/* Sidebar */}
      <aside style={{
        width: '240px',
        background: 'rgba(10, 28, 15, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(74, 250, 130, 0.12)',
        padding: '28px 16px',
        flexShrink: 0,
        flexDirection: 'column',
        gap: '8px',
      }}
      className="hidden md:flex"
      >
        <div style={{ marginBottom: '20px', paddingLeft: '8px' }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            Área do Anunciante
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            Olá, {userName}
          </div>
        </div>

        {tabs.map(item => (
          <button
            key={item.tab}
            onClick={() => (item.tab === 'add' && !editing ? openCreate() : setActiveTab(item.tab))}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 14px', borderRadius: '10px',
              background: activeTab === item.tab ? 'rgba(74, 250, 130, 0.12)' : 'transparent',
              border: `1px solid ${activeTab === item.tab ? 'rgba(74,250,130,0.3)' : 'transparent'}`,
              color: activeTab === item.tab ? '#4afa82' : 'rgba(255,255,255,0.6)',
              fontSize: '14px', fontWeight: activeTab === item.tab ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: 'clamp(16px, 3vw, 32px)', overflowY: 'auto', minWidth: 0 }}>

        {/* Mobile tab bar */}
        <div className="flex md:hidden gap-2 mb-6 overflow-x-auto">
          {tabs.map(item => (
            <button
              key={item.tab}
              onClick={() => (item.tab === 'add' && !editing ? openCreate() : setActiveTab(item.tab))}
              style={{
                padding: '8px 16px', borderRadius: '20px', whiteSpace: 'nowrap',
                background: activeTab === item.tab ? 'rgba(74,250,130,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${activeTab === item.tab ? 'rgba(74,250,130,0.4)' : 'rgba(74,250,130,0.1)'}`,
                color: activeTab === item.tab ? '#4afa82' : 'rgba(255,255,255,0.6)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* RESUMO */}
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ marginBottom: '28px' }}>
              <h1 style={pageTitleStyle}>Resumo</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Visão geral dos seus anúncios</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {[
                { icon: <Package size={22} />, label: 'Anúncios ativos', value: totais.ativos, onClick: () => { setStatusFiltro('ATIVO'); setActiveTab('products'); } },
                { icon: <Archive size={22} />, label: 'Na lixeira', value: totais.lixeira, onClick: () => { setStatusFiltro('EM_LIXEIRA'); setActiveTab('products'); } },
                { icon: <MapPin size={22} />, label: 'Endereços cadastrados', value: enderecos.length },
              ].map(stat => (
                <button
                  key={stat.label}
                  onClick={stat.onClick}
                  disabled={!stat.onClick}
                  style={{
                    ...cardStyle, padding: '20px', textAlign: 'left',
                    cursor: stat.onClick ? 'pointer' : 'default',
                  }}
                >
                  <div style={{
                    width: '44px', height: '44px',
                    background: 'rgba(74, 250, 130, 0.1)',
                    border: '1px solid rgba(74,250,130,0.2)',
                    borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#4afa82', marginBottom: '12px',
                  }}>
                    {stat.icon}
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '26px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{stat.label}</div>
                </button>
              ))}
            </div>

            <div style={{ ...cardStyle, padding: '24px' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', fontFamily: "'Space Grotesk', sans-serif" }}>
                  Publicados recentemente
                </h3>
                <button onClick={openCreate} style={primaryButtonStyle}>
                  <PlusCircle size={16} /> Novo Anúncio
                </button>
              </div>
              {statusFiltro === 'ATIVO' && anuncios.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {anuncios.slice(0, 5).map(ad => (
                    <div key={ad.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(74,250,130,0.06)',
                      borderRadius: '10px', padding: '12px 14px',
                      flexWrap: 'wrap', gap: '8px',
                    }}>
                      <span style={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>{ad.nome}</span>
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{ad.categoria_nome}</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#4afa82', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {formatCurrency(ad.preco)}
                      </span>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {formatDate(ad.data_publicacao)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
                  {loadingList ? 'Carregando...' : 'Você ainda não tem anúncios ativos.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* MEUS ANÚNCIOS */}
        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <h1 style={pageTitleStyle}>Meus Anúncios</h1>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
                  {statusFiltro === 'ATIVO'
                    ? `${totais.ativos} anúncio${totais.ativos !== 1 ? 's' : ''} ativo${totais.ativos !== 1 ? 's' : ''}`
                    : `${totais.lixeira} na lixeira — removidos definitivamente após 30 dias`}
                </p>
              </div>
              <button onClick={openCreate} style={primaryButtonStyle}>
                <PlusCircle size={16} /> Novo Anúncio
              </button>
            </div>

            <div className="flex gap-2 mb-5">
              {([
                { status: 'ATIVO' as StatusFiltro, label: `Ativos (${totais.ativos})` },
                { status: 'EM_LIXEIRA' as StatusFiltro, label: `Lixeira (${totais.lixeira})` },
              ]).map(opt => (
                <button
                  key={opt.status}
                  onClick={() => setStatusFiltro(opt.status)}
                  style={{
                    padding: '6px 16px', borderRadius: '20px',
                    background: statusFiltro === opt.status ? 'rgba(74,250,130,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${statusFiltro === opt.status ? 'rgba(74,250,130,0.4)' : 'rgba(74,250,130,0.1)'}`,
                    color: statusFiltro === opt.status ? '#4afa82' : 'rgba(255,255,255,0.6)',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {loadingList ? (
              <p style={{ color: 'rgba(255,255,255,0.5)' }}>Carregando anúncios...</p>
            ) : anuncios.length === 0 ? (
              <div style={{ ...cardStyle, padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                {statusFiltro === 'ATIVO' ? 'Nenhum anúncio ativo. Que tal publicar o primeiro?' : 'A lixeira está vazia.'}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {anuncios.map(ad => (
                  <div key={ad.id} style={{
                    ...cardStyle, padding: '16px',
                    display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap',
                  }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
                      <ImageWithFallback
                        src={ad.imagem_principal ?? ''}
                        alt={ad.nome}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        {ad.nome}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                        {ad.categoria_nome} • {ad.cidade}, {ad.uf} • publicado em {formatDate(ad.data_publicacao)}
                      </div>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#4afa82', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {formatCurrency(ad.preco)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {statusFiltro === 'ATIVO' ? (
                        <>
                          <button onClick={() => openEdit(ad)} title="Editar" style={iconButtonStyle('#60a5fa', '96, 165, 250')}>
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleRemove(ad)} title="Enviar para a lixeira" style={iconButtonStyle('#f87171', '239, 68, 68')}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => handleRestore(ad)} title="Restaurar" style={{ ...iconButtonStyle('#4afa82', '74, 250, 130'), display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', fontSize: '13px' }}>
                          <RotateCcw size={16} /> Restaurar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NOVO / EDITAR ANÚNCIO */}
        {activeTab === 'add' && (
          <div>
            <div style={{ marginBottom: '28px' }}>
              <h1 style={pageTitleStyle}>{editing ? 'Editar Anúncio' : 'Novo Anúncio'}</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
                {editing ? `Editando "${editing.nome}"` : 'Preencha os dados do produto que deseja anunciar'}
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left column */}
                <div className="flex flex-col gap-5">
                  <FormSection title="Informações do Produto">
                    <AddFormField label="Nome do Produto *" placeholder="Ex: Tomate orgânico caixa 20kg" value={form.nome} onChange={v => update('nome', v)} required />
                    <div>
                      <label style={labelStyle}>Descrição *</label>
                      <textarea
                        placeholder="Descreva seu produto detalhadamente..."
                        value={form.descricao}
                        onChange={e => update('descricao', e.target.value)}
                        required
                        style={{
                          ...inputStyle,
                          minHeight: '100px', resize: 'vertical',
                          display: 'block', width: '100%', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label style={labelStyle}>Categoria *</label>
                        <select
                          value={form.categoriaId}
                          onChange={e => update('categoriaId', e.target.value)}
                          required
                          style={selectStyle}
                        >
                          <option value="">Selecione</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <AddFormField label="Preço (R$) *" placeholder="0,00" value={form.preco} onChange={v => update('preco', v)} type="number" min="0.01" step="0.01" required />
                    </div>
                  </FormSection>

                  <FormSection title="Localização do Produto">
                    <div>
                      <label style={labelStyle}>Endereço *</label>
                      <select
                        value={form.enderecoId}
                        onChange={e => update('enderecoId', e.target.value)}
                        required
                        style={selectStyle}
                      >
                        {enderecos.map(end => (
                          <option key={end.id} value={end.id}>{enderecoLabel(end)}</option>
                        ))}
                        <option value={NOVO_ENDERECO}>+ Cadastrar novo endereço</option>
                      </select>
                    </div>

                    {form.enderecoId === NOVO_ENDERECO && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <AddFormField label={buscandoCep ? 'CEP (buscando...)' : 'CEP'} placeholder="00000-000" value={novoEndereco.cep ?? ''} onChange={handleCepChange} inputMode="numeric" />
                          <AddFormField label="Bairro *" placeholder="Zona rural" value={novoEndereco.bairro} onChange={v => updateEndereco('bairro', v)} required />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2">
                            <AddFormField label="Rua *" placeholder="Estrada Municipal" value={novoEndereco.rua} onChange={v => updateEndereco('rua', v)} required />
                          </div>
                          <AddFormField label="Número *" placeholder="S/N" value={novoEndereco.numero} onChange={v => updateEndereco('numero', v)} required />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2">
                            <AddFormField label="Cidade *" placeholder="Cidade" value={novoEndereco.cidade} onChange={v => updateEndereco('cidade', v)} required />
                          </div>
                          <div>
                            <label style={labelStyle}>UF *</label>
                            <select value={novoEndereco.uf} onChange={e => updateEndereco('uf', e.target.value)} required style={selectStyle}>
                              <option value="">UF</option>
                              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>Zona *</label>
                          <select value={novoEndereco.zona} onChange={e => updateEndereco('zona', e.target.value as Zona)} style={selectStyle}>
                            <option value="URBANA">Urbana</option>
                            <option value="RURAL">Rural</option>
                          </select>
                        </div>
                      </>
                    )}
                  </FormSection>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-5">
                  <FormSection title="Imagem Principal">
                    <label style={{
                      border: '2px dashed rgba(74, 250, 130, 0.2)',
                      borderRadius: '12px', padding: previewPrincipal ? '0' : '28px',
                      textAlign: 'center', cursor: 'pointer',
                      background: 'rgba(74, 250, 130, 0.03)',
                      display: 'block', overflow: 'hidden',
                    }}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={e => setImagemPrincipal(e.target.files?.[0] ?? null)}
                      />
                      {previewPrincipal || (editing && editing.imagem_principal) ? (
                        <div style={{ position: 'relative', height: '200px' }}>
                          <ImageWithFallback
                            src={previewPrincipal ?? editing?.imagem_principal ?? ''}
                            alt="Imagem principal"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{
                            position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '12px',
                            padding: '4px 12px', borderRadius: '6px',
                          }}>
                            Clique para trocar
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload size={32} color="rgba(74, 250, 130, 0.5)" style={{ margin: '0 auto 12px' }} />
                          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '6px' }}>
                            Clique para escolher a imagem principal *
                          </p>
                          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
                            PNG, JPG ou WebP até 10MB
                          </p>
                        </>
                      )}
                    </label>
                  </FormSection>

                  <FormSection title={`Imagens Secundárias (até ${MAX_SECUNDARIAS} por envio)`}>
                    {/* Galeria atual (edição): marque para remover */}
                    {imagensAtuais.filter(img => img.tipo === 'SECUNDARIA').length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {imagensAtuais.filter(img => img.tipo === 'SECUNDARIA').map(img => {
                          const marcada = deletarImagensIds.includes(img.id);
                          return (
                            <div key={img.id} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '10px', overflow: 'hidden', opacity: marcada ? 0.35 : 1 }}>
                              <ImageWithFallback src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button
                                type="button"
                                title={marcada ? 'Manter imagem' : 'Remover imagem'}
                                onClick={() => setDeletarImagensIds(prev => marcada ? prev.filter(id => id !== img.id) : [...prev, img.id])}
                                style={thumbRemoveStyle}
                              >
                                {marcada ? <RotateCcw size={12} /> : <X size={12} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {imagensSecundarias.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {imagensSecundarias.map((file, i) => (
                          <FilePreview
                            key={`${file.name}-${i}`}
                            file={file}
                            onRemove={() => setImagensSecundarias(prev => prev.filter((_, idx) => idx !== i))}
                          />
                        ))}
                      </div>
                    )}

                    {imagensSecundarias.length < MAX_SECUNDARIAS && (
                      <label style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: 'rgba(74,250,130,0.08)',
                        border: '1px solid rgba(74,250,130,0.2)',
                        borderRadius: '10px', padding: '10px',
                        color: '#4afa82', fontSize: '13px', cursor: 'pointer',
                      }}>
                        <ImagePlus size={16} /> Adicionar imagens
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          style={{ display: 'none' }}
                          onChange={e => {
                            const files = Array.from(e.target.files ?? []);
                            setImagensSecundarias(prev => [...prev, ...files].slice(0, MAX_SECUNDARIAS));
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </FormSection>
                </div>
              </div>

              {formError && (
                <div role="alert" style={{
                  marginTop: '20px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px', padding: '12px 16px',
                  color: '#f87171', fontSize: '14px',
                }}>
                  {formError}
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-3 mt-8 flex-wrap">
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: saving ? 'rgba(74, 250, 130, 0.3)' : 'linear-gradient(135deg, #16a34a, #4afa82)',
                    border: 'none', borderRadius: '12px',
                    padding: '14px 32px', color: '#000',
                    fontSize: '15px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                    boxShadow: saving ? 'none' : '0 8px 25px rgba(74,250,130,0.3)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {saving ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Publicar Anúncio'}
                </button>
                <button
                  type="button"
                  onClick={() => { resetForm(); setActiveTab('products'); }}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '12px', padding: '14px 24px',
                    color: 'rgba(255,255,255,0.7)', fontSize: '15px',
                    cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <style>{`select option { background: #0a1c0f; color: #fff; }`}</style>
    </div>
  );
}

const pageTitleStyle: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif", fontSize: '28px', fontWeight: 800, color: '#fff', marginBottom: '4px',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(10, 28, 15, 0.8)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(74,250,130,0.12)',
  borderRadius: '16px',
};

const primaryButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #16a34a, #4afa82)',
  border: 'none', borderRadius: '12px',
  padding: '10px 20px', color: '#000',
  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '6px',
  fontFamily: "'Inter', sans-serif",
  boxShadow: '0 4px 15px rgba(74,250,130,0.3)',
};

function iconButtonStyle(color: string, rgb: string): React.CSSProperties {
  return {
    background: `rgba(${rgb}, 0.1)`,
    border: `1px solid rgba(${rgb}, 0.2)`,
    borderRadius: '8px', padding: '8px',
    cursor: 'pointer', color,
  };
}

const thumbRemoveStyle: React.CSSProperties = {
  position: 'absolute', top: '4px', right: '4px',
  width: '22px', height: '22px', borderRadius: '50%',
  background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', display: 'block',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(74,250,130,0.15)',
  borderRadius: '10px', padding: '11px 14px',
  color: '#fff', fontSize: '14px', outline: 'none',
  fontFamily: "'Inter', sans-serif",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, display: 'block', width: '100%', boxSizing: 'border-box', cursor: 'pointer',
};

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '10px', overflow: 'hidden' }}>
      <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <button type="button" onClick={onRemove} title="Remover" style={thumbRemoveStyle}>
        <X size={12} />
      </button>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, padding: '22px' }}>
      <h3 style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '16px',
        paddingBottom: '12px', borderBottom: '1px solid rgba(74,250,130,0.08)',
      }}>
        {title}
      </h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function AddFormField({ label, placeholder, value, onChange, type = 'text', required, min, step, inputMode }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string; required?: boolean; min?: string; step?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        min={min}
        step={step}
        inputMode={inputMode}
        style={{ ...inputStyle, display: 'block', width: '100%', boxSizing: 'border-box' }}
      />
    </div>
  );
}
