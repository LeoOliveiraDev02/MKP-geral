import type { ReactNode } from 'react';
import { C } from './theme';
import { Card, PageShell } from './ui';

// Dados do controlador: PREENCHA antes de publicar (exigência da LGPD, art. 9º e 41).
const CONTROLADOR = {
  razaoSocial: '[Razão social da empresa]',
  cnpj: '[CNPJ]',
  encarregado: '[Nome do encarregado de dados (DPO)]',
  email: '[e-mail do encarregado, ex: privacidade@seudominio.com.br]',
};
const ATUALIZADA_EM = '18/10/2026';

function Secao({ id, titulo, children }: { id?: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: '22px' }}>
      <h2 style={{ fontSize: '17px', fontWeight: 700, color: C.text, marginBottom: '8px' }}>{titulo}</h2>
      <div style={{ fontSize: '14px', color: C.text, lineHeight: 1.65 }} className="flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}

const lista = { paddingLeft: '20px', listStyle: 'disc' } as const;

/** Política de Privacidade e Termos de Uso (LGPD — Lei 13.709/2018). */
export function PrivacyPage() {
  return (
    <PageShell titulo="Política de Privacidade" subtitulo={`Última atualização: ${ATUALIZADA_EM}`}>
      <Card>
        <Secao titulo="1. Quem cuida dos seus dados">
          <p>
            A AgroMundo é operada por {CONTROLADOR.razaoSocial} (CNPJ {CONTROLADOR.cnpj}), controladora dos dados
            pessoais tratados na plataforma. O encarregado pelo tratamento de dados é {CONTROLADOR.encarregado},
            que atende pelo e-mail {CONTROLADOR.email}.
          </p>
        </Secao>

        <Secao titulo="2. Quais dados coletamos">
          <ul style={lista}>
            <li><strong>Cadastro:</strong> nome, sobrenome, e-mail, telefone/WhatsApp e senha (guardada apenas como hash irreversível).</li>
            <li><strong>Endereços:</strong> rua, número, bairro, CEP, cidade, UF, zona e coordenadas aproximadas (para frete e “perto de mim”).</li>
            <li><strong>Compras e vendas:</strong> pedidos, itens, valores, forma de pagamento escolhida, endereço de entrega e rastreio.</li>
            <li><strong>Comunicação:</strong> mensagens do chat, perguntas, avaliações, cotações e reclamações.</li>
            <li><strong>Produtores:</strong> anúncios, fotos, apresentação e documentos enviados para verificação.</li>
            <li><strong>Segurança:</strong> registros de acesso (data, IP, navegador) e tentativas de login, mantidos sem senhas nem códigos.</li>
          </ul>
          <p>Não coletamos dados de cartão: o pagamento é processado pelo meio de pagamento parceiro.</p>
        </Secao>

        <Secao titulo="3. Para que usamos e com qual base legal">
          <ul style={lista}>
            <li>Criar e manter sua conta, intermediar compras, entregas e o contato com o produtor — <em>execução de contrato</em> (art. 7º, V).</li>
            <li>Emitir registros fiscais e cumprir obrigações legais — <em>obrigação legal</em> (art. 7º, II).</li>
            <li>Prevenir fraudes, proteger contas e manter registros de acesso (Marco Civil, art. 15) — <em>legítimo interesse</em> e <em>obrigação legal</em>.</li>
            <li>Enviar avisos sobre pedidos e mensagens — <em>execução de contrato</em>.</li>
          </ul>
          <p>Não vendemos seus dados e não os usamos para publicidade de terceiros.</p>
        </Secao>

        <Secao titulo="4. Com quem compartilhamos">
          <ul style={lista}>
            <li><strong>Outra parte da negociação:</strong> o produtor recebe nome, telefone e endereço de entrega do pedido; o comprador vê o nome e a localização da retirada.</li>
            <li><strong>Google:</strong> apenas se você escolher “Entrar com Google”.</li>
            <li><strong>OpenStreetMap (Nominatim):</strong> cidade/endereço para calcular coordenadas, sem identificar você.</li>
            <li><strong>Provedores de e-mail, hospedagem e meio de pagamento</strong>, sob contrato e só para prestar o serviço.</li>
            <li><strong>Autoridades</strong>, quando houver ordem judicial ou obrigação legal.</li>
          </ul>
        </Secao>

        <Secao titulo="5. Por quanto tempo guardamos">
          <p>
            Enquanto sua conta existir. Ao excluí-la, os dados são apagados em definitivo, exceto o que a lei manda
            guardar: registros de acesso por 6 meses (Marco Civil da Internet) e documentos fiscais pelo prazo legal.
            Cópias de segurança (backups) são sobrescritas em até 30 dias.
          </p>
        </Secao>

        <Secao titulo="6. Seus direitos (art. 18 da LGPD)">
          <p>Você pode, a qualquer momento:</p>
          <ul style={lista}>
            <li><strong>Acessar e levar seus dados:</strong> em Meu Perfil → “Baixar meus dados” (arquivo JSON).</li>
            <li><strong>Corrigir:</strong> em Meu Perfil → Dados pessoais, Dados de login e Endereços.</li>
            <li><strong>Excluir a conta e os dados:</strong> em Meu Perfil → “Excluir conta” (imediato e definitivo).</li>
            <li>Saber com quem compartilhamos, revogar consentimentos e se opor a tratamentos: pelo e-mail {CONTROLADOR.email}. Respondemos em até 15 dias.</li>
            <li>Reclamar à Autoridade Nacional de Proteção de Dados (ANPD) em gov.br/anpd.</li>
          </ul>
        </Secao>

        <Secao titulo="7. Como protegemos">
          <ul style={lista}>
            <li>Conexão sempre criptografada (HTTPS com HSTS).</li>
            <li>Senhas com hash bcrypt; sessão em cookie protegido (HttpOnly, Secure, SameSite).</li>
            <li>Cada usuário só acessa os próprios pedidos, cotações e conversas, com regras também no banco de dados.</li>
            <li>Limite de tentativas de login, verificação em duas etapas (obrigatória para administradores) e registros de acesso sem dados sensíveis.</li>
            <li>Backups criptografados e testados periodicamente.</li>
          </ul>
          <p>Se houver um incidente que possa causar risco a você, avisaremos você e a ANPD.</p>
        </Secao>

        <Secao titulo="8. Cookies">
          <p>
            Usamos apenas cookies essenciais: o de sessão (mantém você conectado) e o de proteção contra
            requisições forjadas (CSRF). Não usamos cookies de publicidade nem de rastreamento.
          </p>
        </Secao>

        <Secao titulo="9. Crianças e adolescentes">
          <p>A plataforma é destinada a maiores de 18 anos. Não coletamos intencionalmente dados de menores.</p>
        </Secao>

        <Secao id="termos" titulo="10. Termos de Uso (resumo)">
          <ul style={lista}>
            <li>A AgroMundo aproxima compradores e produtores; cada produtor responde pela qualidade, procedência e entrega do que anuncia.</li>
            <li>É proibido anunciar produtos ilegais, usar dados de outras pessoas ou tentar burlar a segurança da plataforma.</li>
            <li>Contas que violarem estes termos podem ser suspensas.</li>
          </ul>
        </Secao>

        <Secao titulo="11. Mudanças nesta política">
          <p>Avisaremos por e-mail e no site sobre mudanças relevantes antes de entrarem em vigor.</p>
        </Secao>
      </Card>
    </PageShell>
  );
}
