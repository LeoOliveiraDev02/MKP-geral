import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Scale, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from './data';
import { C } from './theme';
import {
  Card, EmptyState, Modal, PageShell, Pill, botaoContorno, botaoPerigo, botaoPrimario, botaoSecundario, campo, desabilitado, formatDateTime, rotulo,
} from './ui';
import { useApp } from '../../AppContext';
import { AdminService, AutenticacaoService } from '../../api/services';
import { MfaSetup } from './MfaSetup';
import { getErrorMessage } from '../../api/client';
import type { Reclamacao, StatusReclamacao, Verificacao } from '../../api/types';
import { MOTIVOS } from './OrderDetailPage';
import { STATUS_RECLAMACAO } from './ClaimsPage';

type Aba = 'verificacoes' | 'mediacoes';

type EstadoMfa = { ativo: boolean; sessaoVerificada: boolean; adminExigeMfa: boolean };

/**
 * Administração do marketplace: verificação de produtores e mediação de reclamações.
 * Exige verificação em duas etapas (o backend barra /admin sem o 2º fator na sessão).
 */
export function AdminPage() {
  const [mfa, setMfa] = useState<EstadoMfa | null>(null);
  const carregarMfa = useCallback(() => {
    AutenticacaoService.mfaStatus()
      .then(s => setMfa(s as EstadoMfa))
      .catch(err => toast.error(getErrorMessage(err)));
  }, []);
  useEffect(() => { carregarMfa(); }, [carregarMfa]);

  if (!mfa) {
    return <PageShell titulo="Administração"><p style={{ color: C.muted }}>Carregando...</p></PageShell>;
  }

  if (mfa.adminExigeMfa && !mfa.sessaoVerificada) {
    return (
      <PageShell titulo="Administração" subtitulo="Proteção extra para quem modera o marketplace.">
        <Card>
          <div className="flex items-center gap-2" style={{ marginBottom: '10px' }}>
            <ShieldAlert size={20} color={C.orange} />
            <strong>Verificação em duas etapas obrigatória</strong>
          </div>
          {mfa.ativo ? (
            <>
              <p style={{ fontSize: '14px', color: C.muted, marginBottom: '12px' }}>
                Sua conta já usa verificação em duas etapas, mas esta sessão foi aberta sem o código.
                Saia e entre novamente: o código do autenticador será pedido no login.
              </p>
              <button
                onClick={() => { AutenticacaoService.logout().finally(() => window.location.assign('/')); }}
                style={botaoPrimario}
              >
                Sair e entrar novamente
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '14px', color: C.muted, marginBottom: '12px' }}>
                Para acessar a administração, ative um aplicativo autenticador na sua conta.
                Sem ele, uma senha vazada daria acesso total à moderação.
              </p>
              <MfaSetup onAtivado={carregarMfa} />
            </>
          )}
        </Card>
      </PageShell>
    );
  }

  return <PainelAdmin />;
}

function PainelAdmin() {
  const [aba, setAba] = useState<Aba>('verificacoes');
  return (
    <PageShell titulo="Administração" subtitulo="Acesso liberado para os e-mails em ADMIN_EMAILS (backend).">
      <div className="flex gap-2 mb-5">
        <button onClick={() => setAba('verificacoes')} style={{ ...botaoSecundario, borderColor: aba === 'verificacoes' ? C.orange : C.border, color: aba === 'verificacoes' ? C.orange : C.text, fontWeight: 600 }}>
          <BadgeCheck size={16} /> Verificação de produtores
        </button>
        <button onClick={() => setAba('mediacoes')} style={{ ...botaoSecundario, borderColor: aba === 'mediacoes' ? C.orange : C.border, color: aba === 'mediacoes' ? C.orange : C.text, fontWeight: 600 }}>
          <Scale size={16} /> Mediação de reclamações
        </button>
      </div>
      {aba === 'verificacoes' ? <Verificacoes /> : <Mediacoes />}
    </PageShell>
  );
}

function Verificacoes() {
  const [status, setStatus] = useState<'PENDENTE' | 'APROVADA' | 'REJEITADA' | 'TODAS'>('PENDENTE');
  const [lista, setLista] = useState<Verificacao[] | null>(null);
  const [rejeitando, setRejeitando] = useState<Verificacao | null>(null);
  const [motivo, setMotivo] = useState('');

  const carregar = useCallback(() => {
    setLista(null);
    AdminService.verificacoes(status).then(setLista).catch(err => toast.error(getErrorMessage(err)));
  }, [status]);
  useEffect(() => { carregar(); }, [carregar]);

  const decidir = async (v: Verificacao, decisao: 'APROVADA' | 'REJEITADA', obs?: string) => {
    try {
      await AdminService.decidirVerificacao(v.id, decisao, obs);
      toast.success(decisao === 'APROVADA' ? 'Produtor verificado.' : 'Verificação rejeitada.');
      setRejeitando(null);
      setMotivo('');
      carregar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <select value={status} onChange={e => setStatus(e.target.value as typeof status)} style={{ ...campo, width: 'auto', marginBottom: '14px' }}>
        <option value="PENDENTE">Pendentes</option>
        <option value="APROVADA">Aprovadas</option>
        <option value="REJEITADA">Rejeitadas</option>
        <option value="TODAS">Todas</option>
      </select>
      {lista === null ? <p style={{ color: C.muted }}>Carregando...</p> : lista.length === 0 ? (
        <EmptyState icone={<BadgeCheck size={40} />} titulo="Nada por aqui" />
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map(v => (
            <Card key={v.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{v.usuario_nome}</strong>
                <span style={{ fontSize: '13px', color: C.muted }}>{v.usuario_email}</span>
                <Pill tom={v.status === 'APROVADA' ? 'verde' : v.status === 'REJEITADA' ? 'vermelho' : 'laranja'} style={{ marginLeft: 'auto' }}>{v.status}</Pill>
              </div>
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                {v.tipo_documento}: <strong>{v.documento}</strong>
                {v.car && <> · CAR: <strong>{v.car}</strong></>}
              </div>
              <div style={{ fontSize: '12.5px', color: C.muted }}>Enviado em {formatDateTime(v.data_envio)}{v.observacao ? ` · ${v.observacao}` : ''}</div>
              <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '6px' }}>
                Confira o documento nos órgãos oficiais (Receita Federal / SICAR) antes de aprovar. O sistema só valida os dígitos.
              </p>
              {v.status === 'PENDENTE' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => decidir(v, 'APROVADA')} style={botaoPrimario}>Aprovar</button>
                  <button onClick={() => setRejeitando(v)} style={botaoPerigo}>Rejeitar</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal titulo="Rejeitar verificação" aberto={!!rejeitando} onFechar={() => setRejeitando(null)}>
        <label style={rotulo}>Motivo (o produtor verá esta mensagem)</label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} style={{ ...campo, resize: 'vertical' }} />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setRejeitando(null)} style={botaoSecundario}>Voltar</button>
          <button disabled={!motivo.trim()} onClick={() => rejeitando && decidir(rejeitando, 'REJEITADA', motivo.trim())} style={desabilitado(botaoPerigo, !motivo.trim())}>
            Rejeitar
          </button>
        </div>
      </Modal>
    </>
  );
}

function Mediacoes() {
  const app = useApp();
  const [status, setStatus] = useState<StatusReclamacao | 'TODAS'>('EM_MEDIACAO');
  const [lista, setLista] = useState<Reclamacao[] | null>(null);
  const [decidindo, setDecidindo] = useState<Reclamacao | null>(null);
  const [texto, setTexto] = useState('');

  const carregar = useCallback(() => {
    setLista(null);
    AdminService.reclamacoes(status).then(setLista).catch(err => toast.error(getErrorMessage(err)));
  }, [status]);
  useEffect(() => { carregar(); }, [carregar]);

  const decidir = async (favorecido: 'COMPRADOR' | 'VENDEDOR') => {
    if (!decidindo) return;
    try {
      await AdminService.decidirReclamacao(decidindo.id, favorecido, texto.trim());
      toast.success('Mediação concluída. As duas partes foram avisadas.');
      setDecidindo(null);
      setTexto('');
      carregar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <select value={status} onChange={e => setStatus(e.target.value as typeof status)} style={{ ...campo, width: 'auto', marginBottom: '14px' }}>
        <option value="EM_MEDIACAO">Em mediação</option>
        <option value="ABERTA">Abertas</option>
        <option value="RESPONDIDA">Respondidas</option>
        <option value="TODAS">Todas</option>
      </select>
      {lista === null ? <p style={{ color: C.muted }}>Carregando...</p> : lista.length === 0 ? (
        <EmptyState icone={<Scale size={40} />} titulo="Nenhuma reclamação nesta situação" />
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map(r => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>Pedido #{r.pedido_id}</strong> · {formatCurrency(r.pedido_total)}
                <Pill tom={STATUS_RECLAMACAO[r.status].tom} style={{ marginLeft: 'auto' }}>{STATUS_RECLAMACAO[r.status].rotulo}</Pill>
              </div>
              <div style={{ fontSize: '13px', color: C.muted }}>Cliente {r.comprador_nome} × produtor {r.vendedor_nome} · {MOTIVOS[r.motivo]}</div>
              <p style={{ fontSize: '14px', marginTop: '8px' }}><strong>Cliente:</strong> {r.descricao}</p>
              {r.resposta_vendedor && <p style={{ fontSize: '14px', marginTop: '4px' }}><strong>Produtor:</strong> {r.resposta_vendedor}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => app.go(`/reclamacoes/${r.id}`)} style={botaoSecundario}>Detalhes</button>
                {r.status === 'EM_MEDIACAO' && <button onClick={() => setDecidindo(r)} style={botaoContorno}><Scale size={15} /> Decidir</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal titulo={`Decidir reclamação do pedido #${decidindo?.pedido_id ?? ''}`} aberto={!!decidindo} onFechar={() => setDecidindo(null)}>
        <label style={rotulo}>Justificativa da decisão</label>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} style={{ ...campo, resize: 'vertical' }} />
        <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '6px' }}>
          A favor do cliente: registra reembolso simulado e pesa na reputação do produtor.
        </p>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button disabled={texto.trim().length < 5} onClick={() => decidir('VENDEDOR')} style={desabilitado(botaoSecundario, texto.trim().length < 5)}>
            A favor do produtor
          </button>
          <button disabled={texto.trim().length < 5} onClick={() => decidir('COMPRADOR')} style={desabilitado(botaoPrimario, texto.trim().length < 5)}>
            A favor do cliente
          </button>
        </div>
      </Modal>
    </>
  );
}
