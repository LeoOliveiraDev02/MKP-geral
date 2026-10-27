import { useState } from 'react';
import { Copy, Download, KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AutenticacaoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { C } from './theme';
import { botaoPrimario, botaoSecundario, campo, desabilitado } from './ui';

type Props = {
  /** Chamado depois que o MFA é ativado (a sessão já foi trocada por uma verificada). */
  onAtivado: () => void;
};

/**
 * Configuração da verificação em duas etapas (TOTP): gera a chave, mostra
 * para cadastrar no app autenticador (Google Authenticator, Authy, Microsoft
 * Authenticator...) e confirma com o primeiro código.
 */
/**
 * Códigos de recuperação do MFA: aparecem uma única vez (no servidor só fica
 * o hash). Cada um vale um login caso o celular seja perdido.
 */
export function CodigosRecuperacao({ codigos, onConcluir }: { codigos: string[]; onConcluir: () => void }) {
  const texto = `Códigos de recuperação AgroMundo (cada um vale uma vez)\n\n${codigos.join('\n')}\n`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Códigos copiados.');
    } catch {
      toast.error('Não foi possível copiar. Anote os códigos.');
    }
  };
  const baixar = () => {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agromundo-codigos-recuperacao.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: '460px' }}>
      <p style={{ fontSize: '14px', color: C.text, lineHeight: 1.5 }}>
        <strong>Guarde estes códigos de recuperação</strong> em um local seguro (gerenciador de senhas ou papel).
        Se perder o celular, cada código permite entrar uma vez. Eles não serão mostrados de novo.
      </p>
      <code style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', padding: '12px',
        borderRadius: '10px', background: 'rgba(37,37,34,0.05)', fontSize: '15px', letterSpacing: '1px', userSelect: 'all',
      }}>
        {codigos.map(c => <span key={c}>{c}</span>)}
      </code>
      <div className="flex gap-2 flex-wrap">
        <button onClick={copiar} style={botaoSecundario}><Copy size={16} /> Copiar</button>
        <button onClick={baixar} style={botaoSecundario}><Download size={16} /> Baixar .txt</button>
        <button onClick={onConcluir} style={botaoPrimario}>Já guardei</button>
      </div>
    </div>
  );
}

export function MfaSetup({ onAtivado }: Props) {
  const [chave, setChave] = useState<{ segredo: string; otpauth: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [codigosRecuperacao, setCodigosRecuperacao] = useState<string[] | null>(null);

  const gerar = async () => {
    setEnviando(true);
    try {
      setChave(await AutenticacaoService.mfaSetup());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  const ativar = async () => {
    setEnviando(true);
    try {
      setCodigosRecuperacao(await AutenticacaoService.mfaEnable(codigo));
      toast.success('Verificação em duas etapas ativada.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  if (codigosRecuperacao) {
    return <CodigosRecuperacao codigos={codigosRecuperacao} onConcluir={onAtivado} />;
  }

  if (!chave) {
    return (
      <button onClick={gerar} disabled={enviando} style={{ ...botaoPrimario, ...(enviando ? desabilitado : {}) }}>
        <ShieldCheck size={16} /> Configurar verificação em duas etapas
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: '460px' }}>
      <ol style={{ fontSize: '14px', color: C.text, paddingLeft: '18px', lineHeight: 1.6, listStyle: 'decimal' }}>
        <li>Abra o app autenticador no celular e adicione uma conta.</li>
        <li>
          Digite a chave abaixo (ou, no próprio celular,{' '}
          <a href={chave.otpauth} style={{ color: C.orange, fontWeight: 600 }}>toque aqui para abrir no app</a>).
        </li>
        <li>Informe o código de 6 dígitos que aparecer.</li>
      </ol>
      <code style={{
        display: 'block', padding: '10px 12px', borderRadius: '10px', background: 'rgba(37,37,34,0.05)',
        fontSize: '15px', letterSpacing: '1px', wordBreak: 'break-all', userSelect: 'all',
      }}>
        {chave.segredo.match(/.{1,4}/g)?.join(' ')}
      </code>
      <div className="flex gap-2">
        <input
          value={codigo}
          onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-label="Código do autenticador"
          style={{ ...campo, maxWidth: '140px', letterSpacing: '3px' }}
        />
        <button
          onClick={ativar}
          disabled={enviando || codigo.length !== 6}
          style={{ ...botaoPrimario, ...(enviando || codigo.length !== 6 ? desabilitado : {}) }}
        >
          <KeyRound size={16} /> Ativar
        </button>
        <button onClick={() => { setChave(null); setCodigo(''); }} style={botaoSecundario}>Cancelar</button>
      </div>
    </div>
  );
}
