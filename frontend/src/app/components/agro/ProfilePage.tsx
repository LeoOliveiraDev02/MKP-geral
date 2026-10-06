import { useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, ChevronRight, Hash, Lock, LogOut, Mail, MapPin, Pencil, Phone, Plus,
  ShieldCheck, Trash2, TriangleAlert, User, UserRound, Wheat,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { EnderecoService, UsuarioService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { buscarCep } from '../../api/viacep';
import type { Endereco, EnderecoInput, Usuario, Zona } from '../../api/types';
import { maskCep, maskTelefone, onlyDigits } from '../../utils/masks';
import { formatDate } from './data';
import { FormField, SelectField, UFS, labelStyle } from './FormFields';

type ProfilePageProps = {
  user: Usuario;
  onBack: () => void;
  onUserUpdate: (usuario: Usuario) => void;
  onLogout: () => void;
  onAccountDeleted: () => void;
};

type Section = 'menu' | 'personal' | 'login' | 'addresses';

const SECTION_TITLES: Record<Section, string> = {
  menu: 'Meu Perfil',
  personal: 'Dados pessoais',
  login: 'Dados de login',
  addresses: 'Endereços',
};

export function ProfilePage({ user, onBack, onUserUpdate, onLogout, onAccountDeleted }: ProfilePageProps) {
  const [section, setSection] = useState<Section>('menu');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = (s: Section) => {
    setSection(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ background: '#040e07', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={section === 'menu' ? onBack : () => open('menu')} style={backButtonStyle}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '26px', fontWeight: 800, color: '#fff' }}>
            {SECTION_TITLES[section]}
          </h1>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, x: section === 'menu' ? -16 : 16 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {section === 'menu' && (
              <ProfileMenu
                user={user}
                onOpen={open}
                onLogout={onLogout}
                onDelete={() => setConfirmDelete(true)}
              />
            )}
            {section === 'personal' && <PersonalForm user={user} onSaved={onUserUpdate} />}
            {section === 'login' && <LoginForm user={user} onSaved={onUserUpdate} />}
            {section === 'addresses' && <AddressList />}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {confirmDelete && (
          <DeleteAccountDialog
            onCancel={() => setConfirmDelete(false)}
            onDeleted={onAccountDeleted}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Menu (list view de cards) ───

function ProfileMenu({ user, onOpen, onLogout, onDelete }: {
  user: Usuario;
  onOpen: (s: Section) => void;
  onLogout: () => void;
  onDelete: () => void;
}) {
  const initials = `${user.nome[0] ?? ''}${user.sobrenome[0] ?? ''}`.toUpperCase();
  const memberSince = user.data_cadastro ? formatDate(user.data_cadastro) : null;

  return (
    <div className="flex flex-col gap-6">
      <div style={{ ...cardStyle, padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'default' }}>
        <div style={{
          width: '60px', height: '60px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #16a34a, #4afa82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#000', fontSize: '22px', fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {initials || <UserRound size={28} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.nome} {user.sobrenome}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </div>
          {memberSince && (
            <div style={{ fontSize: '11px', color: 'rgba(74,250,130,0.7)', marginTop: '2px' }}>
              Membro desde {memberSince}
            </div>
          )}
        </div>
      </div>

      <MenuGroup title="Minha conta">
        <MenuCard icon={<User size={20} />} title="Dados pessoais" subtitle="Nome, sobrenome e telefone" onClick={() => onOpen('personal')} />
        <MenuCard icon={<ShieldCheck size={20} />} title="Dados de login" subtitle="E-mail e senha de acesso" onClick={() => onOpen('login')} />
        <MenuCard icon={<MapPin size={20} />} title="Endereços" subtitle="Gerencie seus endereços cadastrados" onClick={() => onOpen('addresses')} />
      </MenuGroup>

      <MenuGroup title="Sessão">
        <MenuCard icon={<LogOut size={20} />} title="Sair da conta" subtitle="Encerrar a sessão neste dispositivo" onClick={onLogout} />
      </MenuGroup>

      <MenuGroup title="Zona de perigo">
        <MenuCard icon={<Trash2 size={20} />} title="Excluir conta" subtitle="Remove definitivamente sua conta e seus dados" onClick={onDelete} danger />
      </MenuGroup>
    </div>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{
        fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 600,
        letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px',
      }}>
        {title}
      </h2>
      <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {children}
      </ul>
    </section>
  );
}

function MenuCard({ icon, title, subtitle, onClick, danger }: {
  icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; danger?: boolean;
}) {
  const accent = danger ? '#f87171' : '#4afa82';
  return (
    <li>
      <motion.button
        onClick={onClick}
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
        style={{
          ...cardStyle,
          width: '100%', textAlign: 'left', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: '14px',
          borderColor: danger ? 'rgba(239,68,68,0.25)' : cardStyle.borderColor,
          background: danger ? 'rgba(239,68,68,0.06)' : cardStyle.background,
        }}
      >
        <div style={{
          width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
          background: danger ? 'rgba(239,68,68,0.12)' : 'rgba(74,250,130,0.1)',
          color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: danger ? '#f87171' : '#fff' }}>{title}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>{subtitle}</div>
        </div>
        <ChevronRight size={18} color={danger ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.3)'} />
      </motion.button>
    </li>
  );
}

// ─── Dados pessoais ───

function PersonalForm({ user, onSaved }: { user: Usuario; onSaved: (u: Usuario) => void }) {
  const [nome, setNome] = useState(user.nome);
  const [sobrenome, setSobrenome] = useState(user.sobrenome);
  const [telefone, setTelefone] = useState(maskTelefone(user.telefone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // PUT /users/profile exige todos os campos; o e-mail vai inalterado.
      const usuario = await UsuarioService.updateProfile({ nome, sobrenome, email: user.email, telefone });
      onSaved(usuario);
      toast.success('Dados pessoais atualizados.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ ...cardStyle, cursor: 'default', padding: '20px' }} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Nome" icon={<User size={16} />} placeholder="João" value={nome} onChange={setNome} autoComplete="given-name" required />
        <FormField label="Sobrenome" icon={<User size={16} />} placeholder="da Silva" value={sobrenome} onChange={setSobrenome} autoComplete="family-name" required />
      </div>
      <FormField
        label="Telefone / WhatsApp"
        icon={<Phone size={16} />}
        placeholder="(11) 99999-9999"
        type="tel"
        inputMode="tel"
        value={telefone}
        onChange={v => setTelefone(maskTelefone(v))}
        autoComplete="tel"
        required
      />
      <ErrorBox message={error} />
      <SubmitButton loading={saving}>Salvar alterações</SubmitButton>
    </form>
  );
}

// ─── Dados de login ───

function LoginForm({ user, onSaved }: { user: Usuario; onSaved: (u: Usuario) => void }) {
  const [email, setEmail] = useState(user.email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);
  const [senhaError, setSenhaError] = useState<string | null>(null);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    setEmailError(null);
    try {
      const usuario = await UsuarioService.updateProfile({
        nome: user.nome, sobrenome: user.sobrenome, telefone: user.telefone, email,
      });
      onSaved(usuario);
      toast.success('E-mail atualizado.');
    } catch (err) {
      setEmailError(getErrorMessage(err));
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha !== confirmar) {
      setSenhaError('A nova senha e a confirmação não conferem.');
      return;
    }
    setSavingSenha(true);
    setSenhaError(null);
    try {
      await UsuarioService.updatePassword(senhaAtual, novaSenha, confirmar);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmar('');
      toast.success('Senha atualizada.');
    } catch (err) {
      setSenhaError(getErrorMessage(err));
    } finally {
      setSavingSenha(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleEmail} style={{ ...cardStyle, cursor: 'default', padding: '20px' }} className="flex flex-col gap-4">
        <CardTitle icon={<Mail size={16} />}>E-mail de acesso</CardTitle>
        <FormField label="E-mail" icon={<Mail size={16} />} placeholder="seu@email.com" type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <ErrorBox message={emailError} />
        <SubmitButton loading={savingEmail} disabled={email.trim() === user.email}>Atualizar e-mail</SubmitButton>
      </form>

      <form onSubmit={handleSenha} style={{ ...cardStyle, cursor: 'default', padding: '20px' }} className="flex flex-col gap-4">
        <CardTitle icon={<Lock size={16} />}>Alterar senha</CardTitle>
        <FormField label="Senha atual" icon={<Lock size={16} />} placeholder="Sua senha atual" type="password" value={senhaAtual} onChange={setSenhaAtual} autoComplete="current-password" required />
        <FormField label="Nova senha" icon={<Lock size={16} />} placeholder="Mínimo 8 caracteres" type="password" value={novaSenha} onChange={setNovaSenha} autoComplete="new-password" required />
        <FormField label="Confirmar nova senha" icon={<Lock size={16} />} placeholder="Repita a nova senha" type="password" value={confirmar} onChange={setConfirmar} autoComplete="new-password" required />
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '-8px' }}>
          Use letras maiúsculas, minúsculas, números e um caractere especial.
        </p>
        <ErrorBox message={senhaError} />
        <SubmitButton loading={savingSenha}>Alterar senha</SubmitButton>
      </form>
    </div>
  );
}

// ─── Endereços ───

const EMPTY_ADDRESS: EnderecoInput = { rua: '', numero: '', bairro: '', cep: '', cidade: '', uf: '', zona: 'URBANA' };

function AddressList() {
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = nenhum formulário aberto; 'new' = cadastro; número = edição do endereço com esse id.
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  useEffect(() => {
    EnderecoService.list()
      .then(setEnderecos)
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (endereco: Endereco) => {
    setEnderecos(prev => prev.some(e => e.id === endereco.id)
      ? prev.map(e => (e.id === endereco.id ? endereco : e))
      : [...prev, endereco]);
    setEditing(null);
  };

  const handleDelete = async (endereco: Endereco) => {
    if (!window.confirm(`Remover o endereço "${endereco.rua}, ${endereco.numero}"?`)) return;
    try {
      await EnderecoService.delete(endereco.id);
      setEnderecos(prev => prev.filter(e => e.id !== endereco.id));
      toast.success('Endereço removido.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (loading) {
    return <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '60px 0' }}>Carregando endereços...</p>;
  }
  if (error) {
    return <p style={{ color: '#f87171', textAlign: 'center', padding: '60px 0' }}>{error}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {enderecos.length === 0 && editing !== 'new' && (
        <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '40px 0' }}>
          Nenhum endereço cadastrado.
        </p>
      )}

      {enderecos.map(endereco => editing === endereco.id ? (
        <AddressForm
          key={endereco.id}
          initial={endereco}
          onCancel={() => setEditing(null)}
          onSaved={handleSaved}
        />
      ) : (
        <div key={endereco.id} style={{ ...cardStyle, cursor: 'default', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
            background: 'rgba(74,250,130,0.1)', color: '#4afa82',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {endereco.zona === 'RURAL' ? <Wheat size={20} /> : <Building2 size={20} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>
              {endereco.rua}, {endereco.numero}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
              {endereco.bairro} · {endereco.cidade}/{endereco.uf}
              {endereco.cep ? ` · ${maskCep(endereco.cep)}` : ''} · {endereco.zona === 'RURAL' ? 'Rural' : 'Urbana'}
            </div>
          </div>
          <IconButton title="Editar endereço" onClick={() => setEditing(endereco.id)}>
            <Pencil size={16} />
          </IconButton>
          <IconButton title="Remover endereço" onClick={() => handleDelete(endereco)} danger>
            <Trash2 size={16} />
          </IconButton>
        </div>
      ))}

      {editing === 'new' ? (
        <AddressForm initial={EMPTY_ADDRESS} onCancel={() => setEditing(null)} onSaved={handleSaved} />
      ) : (
        <button
          onClick={() => setEditing('new')}
          style={{
            ...cardStyle, padding: '14px', borderStyle: 'dashed',
            color: '#4afa82', fontSize: '14px', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <Plus size={18} /> Adicionar endereço
        </button>
      )}
    </div>
  );
}

function AddressForm({ initial, onCancel, onSaved }: {
  initial: EnderecoInput | Endereco;
  onCancel: () => void;
  onSaved: (endereco: Endereco) => void;
}) {
  const [form, setForm] = useState<EnderecoInput>({
    rua: initial.rua, numero: initial.numero, bairro: initial.bairro,
    cep: initial.cep ? maskCep(initial.cep) : '',
    cidade: initial.cidade, uf: initial.uf, zona: initial.zona,
  });
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = 'id' in initial ? initial.id : null;

  const update = (key: keyof EnderecoInput, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleCepChange = async (value: string) => {
    const cep = maskCep(value);
    update('cep', cep);
    if (onlyDigits(cep).length !== 8) return;

    setBuscandoCep(true);
    try {
      const endereco = await buscarCep(cep);
      if (!endereco) {
        toast.error('CEP não encontrado.');
        return;
      }
      // Ignora a resposta se o usuário já mudou o CEP enquanto a consulta rodava.
      setForm(prev => prev.cep !== cep ? prev : {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = { ...form, cep: form.cep || undefined };
      const endereco = id === null ? await EnderecoService.create(input) : await EnderecoService.update(id, input);
      toast.success(id === null ? 'Endereço cadastrado.' : 'Endereço atualizado.');
      onSaved(endereco);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ ...cardStyle, cursor: 'default', padding: '20px', borderColor: 'rgba(74,250,130,0.35)' }} className="flex flex-col gap-4">
      <CardTitle icon={<MapPin size={16} />}>{id === null ? 'Novo endereço' : 'Editar endereço'}</CardTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label={buscandoCep ? 'CEP (buscando...)' : 'CEP (opcional)'}
          icon={<Hash size={16} />}
          placeholder="00000-000"
          value={form.cep ?? ''}
          onChange={handleCepChange}
          inputMode="numeric"
        />
        <FormField label="Bairro" icon={<MapPin size={16} />} placeholder="Centro" value={form.bairro} onChange={v => update('bairro', v)} required />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <FormField label="Rua" icon={<MapPin size={16} />} placeholder="Rua das Palmeiras" value={form.rua} onChange={v => update('rua', v)} required />
        </div>
        <FormField label="Número" icon={<Hash size={16} />} placeholder="123" value={form.numero} onChange={v => update('numero', v)} required />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <FormField label="Cidade" icon={<MapPin size={16} />} placeholder="Campinas" value={form.cidade} onChange={v => update('cidade', v)} required />
        </div>
        <SelectField label="UF" value={form.uf} onChange={v => update('uf', v)} required>
          <option value="">UF</option>
          {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
        </SelectField>
      </div>
      <div>
        <label style={labelStyle}>Zona</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          {(['URBANA', 'RURAL'] as Zona[]).map(z => (
            <button
              key={z}
              type="button"
              onClick={() => update('zona', z)}
              style={{
                flex: 1, padding: '10px',
                background: form.zona === z ? 'rgba(74, 250, 130, 0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${form.zona === z ? 'rgba(74, 250, 130, 0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '10px', cursor: 'pointer',
                color: form.zona === z ? '#4afa82' : 'rgba(255,255,255,0.7)',
                fontSize: '13px', fontWeight: 600, fontFamily: "'Inter', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {z === 'URBANA' ? <><Building2 size={15} /> Urbana</> : <><Wheat size={15} /> Rural</>}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox message={error} />
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} style={{ ...secondaryButtonStyle, flex: 1 }}>Cancelar</button>
        <div style={{ flex: 2 }}>
          <SubmitButton loading={saving}>{id === null ? 'Cadastrar' : 'Salvar'}</SubmitButton>
        </div>
      </div>
      <style>{`select option { background: #0a1c0f; color: #fff; }`}</style>
    </form>
  );
}

// ─── Excluir conta ───

const CONFIRM_WORD = 'EXCLUIR';

function DeleteAccountDialog({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await UsuarioService.deleteAccount();
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => !deleting && onCancel()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 12 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px',
          background: 'rgba(14, 24, 16, 0.98)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '20px', padding: '24px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          width: '48px', height: '48px', borderRadius: '14px', marginBottom: '16px',
          background: 'rgba(239,68,68,0.12)', color: '#f87171',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TriangleAlert size={24} />
        </div>
        <h2 id="delete-account-title" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
          Excluir sua conta?
        </h2>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, marginBottom: '16px' }}>
          Esta ação é permanente. Seus dados, endereços, anúncios e favoritos serão apagados e não poderão ser recuperados.
        </p>
        <label style={labelStyle}>
          Digite <strong style={{ color: '#f87171' }}>{CONFIRM_WORD}</strong> para confirmar
        </label>
        <input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '12px', borderRadius: '10px', outline: 'none',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fff', fontSize: '14px', fontFamily: "'Inter', sans-serif", marginBottom: '16px',
          }}
        />
        <ErrorBox message={error} />
        <div className="flex gap-3" style={{ marginTop: error ? '16px' : 0 }}>
          <button type="button" onClick={onCancel} disabled={deleting} style={{ ...secondaryButtonStyle, flex: 1 }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={typed.trim().toUpperCase() !== CONFIRM_WORD || deleting}
            style={{
              flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
              background: '#dc2626', color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              opacity: typed.trim().toUpperCase() !== CONFIRM_WORD || deleting ? 0.4 : 1,
            }}
          >
            {deleting ? 'Excluindo...' : 'Excluir conta'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Peças compartilhadas ───

const cardStyle: React.CSSProperties = {
  background: 'rgba(10, 28, 15, 0.8)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'rgba(74,250,130,0.12)',
  borderRadius: '14px',
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
};

const backButtonStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(74,250,130,0.15)',
  borderRadius: '10px', padding: '8px 16px',
  color: 'rgba(255,255,255,0.7)', fontSize: '13px',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '12px', borderRadius: '12px',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
};

function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4afa82', fontSize: '14px', fontWeight: 700 }}>
      {icon} {children}
    </div>
  );
}

function IconButton({ title, onClick, danger, children }: {
  title: string; onClick: () => void; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        background: danger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74,250,130,0.08)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'rgba(74,250,130,0.2)'}`,
        borderRadius: '8px', padding: '8px', flexShrink: 0,
        cursor: 'pointer', color: danger ? '#f87171' : '#4afa82',
      }}
    >
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" style={{
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '10px', padding: '10px 14px',
      color: '#f87171', fontSize: '13px', lineHeight: 1.4,
    }}>
      {message}
    </div>
  );
}

function SubmitButton({ loading, disabled, children }: { loading: boolean; disabled?: boolean; children: React.ReactNode }) {
  const off = loading || disabled;
  return (
    <button
      type="submit"
      disabled={off}
      style={{
        width: '100%', padding: '12px',
        background: off ? 'rgba(74, 250, 130, 0.3)' : 'linear-gradient(135deg, #16a34a, #4afa82)',
        border: 'none', borderRadius: '12px',
        color: off ? 'rgba(255,255,255,0.7)' : '#000',
        fontSize: '14px', fontWeight: 700, cursor: off ? 'not-allowed' : 'pointer',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {loading ? 'Salvando...' : children}
    </button>
  );
}
