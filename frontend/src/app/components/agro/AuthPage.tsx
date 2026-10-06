import { useState } from 'react';
import { Eye, EyeOff, Leaf, ArrowLeft, User, Mail, Lock, Phone, MapPin, Hash, KeyRound, Sprout, Tractor, MessageCircle, Building2, Wheat } from 'lucide-react';
import { toast } from 'sonner';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { AutenticacaoService, EnderecoService, UsuarioService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { buscarCep } from '../../api/viacep';
import type { Usuario, Zona } from '../../api/types';
import { maskCep, maskTelefone, onlyDigits } from '../../utils/masks';
import { GoogleLoginButton } from './GoogleLoginButton';
import { FormField, SectionLabel, SelectField, UFS, fieldBoxStyle, inputStyle, labelStyle, linkButtonStyle } from './FormFields';

type AuthPageProps = {
  onBack: () => void;
  onLogin: (usuario: Usuario) => void;
};

// 'complete': etapa pós-login com Google para preencher telefone e endereço.
type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'complete';

const EMPTY_FORM = {
  nome: '', sobrenome: '', email: '', telefone: '', senha: '',
  rua: '', numero: '', bairro: '', cep: '', cidade: '', uf: '', zona: 'URBANA' as Zona,
  codigo: '',
};

export function AuthPage({ onBack, onLogin }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // Usuário já autenticado via Google aguardando completar o perfil.
  const [pendingUser, setPendingUser] = useState<Usuario | null>(null);

  const [buscandoCep, setBuscandoCep] = useState(false);

  const updateForm = (key: keyof typeof EMPTY_FORM, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleCepChange = async (value: string) => {
    const cep = maskCep(value);
    updateForm('cep', cep);
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

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        const { usuario } = await AutenticacaoService.login(form.email, form.senha);
        toast.success(`Bem-vindo de volta, ${usuario.nome}!`);
        onLogin(usuario);
      } else if (mode === 'register') {
        const { usuario } = await AutenticacaoService.register({
          nome: form.nome,
          sobrenome: form.sobrenome,
          email: form.email,
          telefone: form.telefone,
          senha: form.senha,
          rua: form.rua,
          numero: form.numero,
          bairro: form.bairro,
          cep: form.cep || undefined,
          cidade: form.cidade,
          uf: form.uf,
          zona: form.zona,
        });
        toast.success('Cadastro realizado com sucesso.');
        onLogin(usuario);
      } else if (mode === 'complete' && pendingUser) {
        // Perfil antes do endereço: o PUT é idempotente, então reenviar após
        // uma falha no endereço não duplica nada.
        const atualizado = await UsuarioService.updateProfile({
          nome: form.nome,
          sobrenome: form.sobrenome,
          email: pendingUser.email,
          telefone: form.telefone,
        });
        await EnderecoService.create({
          rua: form.rua,
          numero: form.numero,
          bairro: form.bairro,
          cep: form.cep || undefined,
          cidade: form.cidade,
          uf: form.uf,
          zona: form.zona,
        });
        toast.success('Perfil completo. Bem-vindo à AgroMundo!');
        onLogin({ ...pendingUser, ...atualizado });
      } else if (mode === 'forgot') {
        const message = await AutenticacaoService.forgotPassword(form.email);
        toast.success(message ?? 'Código enviado.');
        setMode('reset');
      } else {
        const message = await AutenticacaoService.resetPassword(form.email, form.codigo, form.senha);
        toast.success(message ?? 'Senha redefinida.');
        setForm(prev => ({ ...prev, senha: '', codigo: '' }));
        setMode('login');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      const { usuario, novoUsuario } = await AutenticacaoService.loginWithGoogle(credential);
      // O Google não fornece telefone nem endereço: pede para completar antes de entrar.
      if (!usuario.telefone) {
        setPendingUser(usuario);
        setForm({
          ...EMPTY_FORM,
          nome: usuario.nome,
          sobrenome: usuario.sobrenome === '-' ? '' : usuario.sobrenome,
          email: usuario.email,
        });
        setMode('complete');
        toast.success(novoUsuario ? `Conta criada, ${usuario.nome}!` : `Olá, ${usuario.nome}!`);
        return;
      }
      toast.success(`Bem-vindo de volta, ${usuario.nome}!`);
      onLogin(usuario);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Sessão já existe (token salvo): pular apenas adia o preenchimento.
  const skipComplete = () => {
    if (!pendingUser) return;
    toast.info('Você pode completar seus dados depois em Meu Perfil.');
    onLogin(pendingUser);
  };

  const handleBackClick = mode === 'complete' ? skipComplete : onBack;

  const titles: Record<Mode, { title: string; subtitle: string; submit: string }> = {
    login: { title: 'Bem-vindo de volta!', subtitle: 'Entre para acessar sua conta AgroMundo', submit: 'Entrar na AgroMundo' },
    register: { title: 'Crie sua conta', subtitle: 'Preencha os dados abaixo para começar', submit: 'Criar Minha Conta' },
    forgot: { title: 'Recuperar senha', subtitle: 'Enviaremos um código de 6 dígitos para o seu e-mail', submit: 'Enviar código' },
    complete: { title: 'Complete seu perfil', subtitle: 'Falta pouco! Informe seu telefone e endereço para negociar e anunciar', submit: 'Salvar e continuar' },
    reset: { title: 'Redefinir senha', subtitle: 'Informe o código recebido por e-mail e a nova senha', submit: 'Redefinir senha' },
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#040e07',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background image */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1508175688576-0c076b47b5b5?w=1400&q=80"
          alt="Background"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.15 }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 20% 50%, rgba(22, 101, 52, 0.3) 0%, transparent 60%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 80% 20%, rgba(74, 250, 130, 0.05) 0%, transparent 50%)',
        }} />
      </div>

      {/* Left panel - visible on desktop */}
      <div className="hidden lg:flex flex-col justify-between"
        style={{
          width: '45%', padding: '60px',
          position: 'relative', zIndex: 1,
        }}
      >
        <button
          onClick={handleBackClick}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(74,250,130,0.15)',
            borderRadius: '10px', padding: '8px 16px',
            color: 'rgba(255,255,255,0.7)', fontSize: '13px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            width: 'fit-content',
          }}
        >
          <ArrowLeft size={16} /> Voltar
        </button>

        <div>
          <div className="flex items-center gap-3 mb-8">
            <div style={{
              width: '56px', height: '56px',
              background: 'linear-gradient(135deg, #16a34a, #4afa82)',
              borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(74, 250, 130, 0.5)',
            }}>
              <Leaf size={28} color="#fff" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                Agro<span style={{ color: '#4afa82' }}>Mundo</span>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(74, 250, 130, 0.7)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                Marketplace Agro
              </div>
            </div>
          </div>

          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '38px', fontWeight: 800, color: '#fff',
            lineHeight: 1.2, marginBottom: '16px',
          }}>
            O agronegócio<br />
            <span style={{ color: '#4afa82' }}>digital</span> começa<br />
            aqui.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px', lineHeight: 1.6, maxWidth: '360px' }}>
            Conecte-se direto com produtores rurais. Compre, anuncie e negocie sem intermediários.
          </p>

          <div className="flex flex-col gap-4 mt-10">
            {[
              { icon: Sprout, text: 'Anuncie seus produtos gratuitamente' },
              { icon: Tractor, text: 'Contato direto com o produtor' },
              { icon: MessageCircle, text: 'Negociação pelo WhatsApp' },
            ].map(item => (
              <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <item.icon size={24} color="#4afa82" style={{ flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>
          © 2026 AgroMundo. Todos os direitos reservados.
        </div>
      </div>

      {/* Right panel - form */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(20px, 5vw, 60px)',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          width: '100%', maxWidth: mode === 'register' || mode === 'complete' ? '560px' : '460px',
          background: 'rgba(10, 28, 15, 0.85)',
          backdropFilter: 'blur(30px)',
          border: '1px solid rgba(74, 250, 130, 0.15)',
          borderRadius: '24px', padding: 'clamp(24px, 5vw, 40px)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}>
          {/* Mobile back button */}
          <button
            onClick={handleBackClick}
            className="flex lg:hidden items-center gap-2 mb-6"
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} /> Voltar
          </button>

          {/* Mode toggle */}
          {(mode === 'login' || mode === 'register') && (
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(74,250,130,0.1)',
              borderRadius: '12px', padding: '4px',
              marginBottom: '28px',
            }}>
              {(['login', 'register'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1, padding: '10px',
                    background: mode === m ? 'linear-gradient(135deg, #16a34a, #4afa82)' : 'transparent',
                    border: 'none', borderRadius: '8px',
                    color: mode === m ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.2s', fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {m === 'login' ? 'Entrar' : 'Cadastrar'}
                </button>
              ))}
            </div>
          )}

          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '24px', fontWeight: 700, color: '#fff',
            marginBottom: '8px',
          }}>
            {titles[mode].title}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '24px' }}>
            {titles[mode].subtitle}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">

              {(mode === 'register' || mode === 'complete') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Nome" icon={<User size={16} />} placeholder="João" value={form.nome} onChange={v => updateForm('nome', v)} required />
                  <FormField label="Sobrenome" icon={<User size={16} />} placeholder="da Silva" value={form.sobrenome} onChange={v => updateForm('sobrenome', v)} required />
                </div>
              )}

              {mode !== 'complete' && (
                <FormField
                  label="E-mail"
                  icon={<Mail size={16} />}
                  placeholder="seu@email.com"
                  type="email"
                  value={form.email}
                  onChange={v => updateForm('email', v)}
                  required
                />
              )}

              {(mode === 'register' || mode === 'complete') && (
                <>
                  <FormField
                    label="Telefone / WhatsApp"
                    icon={<Phone size={16} />}
                    placeholder="(11) 99999-9999"
                    type="tel"
                    value={form.telefone}
                    onChange={v => updateForm('telefone', maskTelefone(v))}
                    inputMode="tel"
                    required
                  />

                  <SectionLabel>Endereço</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      label={buscandoCep ? 'CEP (buscando...)' : 'CEP (opcional)'}
                      icon={<Hash size={16} />}
                      placeholder="00000-000"
                      value={form.cep}
                      onChange={handleCepChange}
                      inputMode="numeric"
                    />
                    <FormField label="Bairro" icon={<MapPin size={16} />} placeholder="Centro" value={form.bairro} onChange={v => updateForm('bairro', v)} required />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <FormField label="Rua" icon={<MapPin size={16} />} placeholder="Rua das Palmeiras" value={form.rua} onChange={v => updateForm('rua', v)} required />
                    </div>
                    <FormField label="Número" icon={<Hash size={16} />} placeholder="123" value={form.numero} onChange={v => updateForm('numero', v)} required />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <FormField label="Cidade" icon={<MapPin size={16} />} placeholder="Campinas" value={form.cidade} onChange={v => updateForm('cidade', v)} required />
                    </div>
                    <SelectField label="UF" value={form.uf} onChange={v => updateForm('uf', v)} required>
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
                          onClick={() => updateForm('zona', z)}
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
                </>
              )}

              {mode === 'reset' && (
                <FormField
                  label="Código de verificação"
                  icon={<KeyRound size={16} />}
                  placeholder="000000"
                  value={form.codigo}
                  onChange={v => updateForm('codigo', onlyDigits(v).slice(0, 6))}
                  inputMode="numeric"
                  required
                />
              )}

              {/* Password field */}
              {mode !== 'forgot' && mode !== 'complete' && (
                <div>
                  <label style={labelStyle}>
                    {mode === 'reset' ? 'Nova senha' : 'Senha'}
                  </label>
                  <div style={fieldBoxStyle}>
                    <div style={{ padding: '0 12px', color: 'rgba(255,255,255,0.3)' }}>
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 8 caracteres"
                      value={form.senha}
                      onChange={e => updateForm('senha', e.target.value)}
                      required
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{ background: 'none', border: 'none', padding: '12px', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {(mode === 'register' || mode === 'reset') && (
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '6px' }}>
                      Use letras maiúsculas, minúsculas, números e um caractere especial.
                    </p>
                  )}
                </div>
              )}

              {mode === 'login' && (
                <div style={{ textAlign: 'right' }}>
                  <button type="button" onClick={() => switchMode('forgot')} style={linkButtonStyle}>
                    Esqueci minha senha
                  </button>
                </div>
              )}

              {error && (
                <div role="alert" style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px', padding: '10px 14px',
                  color: '#f87171', fontSize: '13px', lineHeight: 1.4,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px',
                  background: loading
                    ? 'rgba(74, 250, 130, 0.3)'
                    : 'linear-gradient(135deg, #16a34a, #4afa82)',
                  border: 'none', borderRadius: '12px',
                  color: loading ? 'rgba(255,255,255,0.7)' : '#000',
                  fontSize: '15px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  marginTop: '8px', transition: 'all 0.2s',
                  boxShadow: loading ? 'none' : '0 8px 25px rgba(74, 250, 130, 0.35)',
                  fontFamily: "'Inter', sans-serif",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff', borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    Processando...
                  </>
                ) : (
                  titles[mode].submit
                )}
              </button>

              {(mode === 'login' || mode === 'register') && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    ou
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  </div>
                  <GoogleLoginButton
                    onCredential={handleGoogleCredential}
                    text={mode === 'login' ? 'signin_with' : 'signup_with'}
                  />
                </>
              )}

              {(mode === 'login' || mode === 'register') ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
                  {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
                  <button
                    type="button"
                    onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                    style={{ ...linkButtonStyle, fontSize: '12px' }}
                  >
                    {mode === 'login' ? 'Cadastre-se grátis' : 'Fazer login'}
                  </button>
                </p>
              ) : mode === 'complete' ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
                  <button type="button" onClick={skipComplete} style={{ ...linkButtonStyle, fontSize: '12px' }}>
                    Completar depois
                  </button>
                </p>
              ) : (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
                  {mode === 'reset' && (
                    <>
                      <button type="button" onClick={() => switchMode('forgot')} style={{ ...linkButtonStyle, fontSize: '12px' }}>
                        Reenviar código
                      </button>
                      {' · '}
                    </>
                  )}
                  <button type="button" onClick={() => switchMode('login')} style={{ ...linkButtonStyle, fontSize: '12px' }}>
                    Voltar ao login
                  </button>
                </p>
              )}

              {mode === 'register' && (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '11px', lineHeight: 1.5 }}>
                  Ao criar sua conta, você concorda com os{' '}
                  <span style={{ color: '#4afa82' }}>Termos de Uso</span> e{' '}
                  <span style={{ color: '#4afa82' }}>Política de Privacidade</span>.
                </p>
              )}
            </div>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: #0a1c0f; color: #fff; }
      `}</style>
    </div>
  );
}
