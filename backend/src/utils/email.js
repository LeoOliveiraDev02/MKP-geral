/**
 * @file email.js
 * @description Utilitário de e-mails para o sistema Agrostand.
 * Configura e inicializa o transporte de e-mails usando a biblioteca Nodemailer. Ele permite
 * enviar e-mails de recuperação de senha ou notificações transacionais aos usuários.
 * 
 * Papel no fluxo de negócios:
 * - Quando um usuário solicita a redefinição de senha (esqueci minha senha), o AutenticacaoController gera um 
 *   código de verificação temporário e invoca o método `sendRecoveryEmail` para enviar esse código
 *   ao e-mail cadastrado.
 * - Suporta três níveis de funcionamento para facilitar o desenvolvimento:
 *   1. SMTP de Produção/Homologação (configurado via variáveis de ambiente .env)
 *   2. Conta de Testes Ethereal (gerada automaticamente se não houver SMTP configurado)
 *   3. Fallback em Console (imprime as informações no terminal caso os serviços acima falhem/não existam,
 *      garantindo que o fluxo não quebre localmente).
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');

// Variável que guarda a instância única (singleton) do transportador do Nodemailer para reaproveitar conexões.
let transporter = null;

/**
 * Cria ou recupera a conexão de transporte de e-mail ativa.
 * Analisa as variáveis de ambiente e decide se usará SMTP real, Ethereal Mail ou console fallback.
 * 
 * @returns {Promise<Object|string>} Objeto de transporte Nodemailer ou a string 'console' para fallback.
 */
async function getTransporter() {
  // Se o transporte já foi instanciado anteriormente, reutiliza-o (padrão Singleton)
  if (transporter) return transporter;

  // Verifica se as credenciais de SMTP estão devidamente preenchidas no arquivo .env
  const isConfigured = 
    process.env.SMTP_USER && 
    process.env.SMTP_USER !== 'your_smtp_username' &&
    process.env.SMTP_PASS && 
    process.env.SMTP_PASS !== 'your_smtp_password';

  if (isConfigured) {
    logger.info('Using configured SMTP provider.');
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    // A porta 465 exige conexões SSL seguras (secure: true).
    // Portas como 587 ou 2525 usam STARTTLS (secure: false).
    const secure = port === 465;

    // Cria transporte com os dados do SMTP real inserido pelo administrador do sistema
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: port,
      secure: secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else if (process.env.NODE_ENV === 'production') {
    // Produção sem SMTP: não usa Ethereal (o link de prévia exporia códigos de recuperação nos logs).
    logger.error('SMTP não configurado em produção: e-mails desativados.', new Error('SMTP ausente'));
    transporter = 'console';
  } else {
    // Caso contrário, avisa no log que não há SMTP real e tenta usar o Ethereal (serviço gratuito de e-mails fake)
    logger.warn('SMTP is not fully configured. Attempting to create Ethereal test account...');
    try {
      // Cria uma conta de testes efêmera no serviço Ethereal
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user, // Usuário gerado dinamicamente
          pass: testAccount.pass  // Senha gerada dinamicamente
        }
      });
      logger.info('Ethereal test account created successfully.');
    } catch (error) {
      // Se nem o Ethereal puder ser criado (ex: sem internet ou bloqueio de rede),
      // caímos no fallback final imprimindo o e-mail no console do servidor.
      logger.error('Failed to create Ethereal test account, falling back to console logger', error);
      transporter = 'console';
    }
  }

  return transporter;
}

/**
 * Envia um e-mail de recuperação de senha com o código de verificação de 6 dígitos.
 * 
 * @param {string} toEmail - E-mail do destinatário.
 * @param {string} recoveryCode - Código de verificação gerado para a redefinição de senha.
 * @returns {Promise<boolean>} Retorna true se a operação foi bem-sucedida.
 */
async function sendRecoveryEmail(toEmail, recoveryCode) {
  // Define o remetente, destinatário, assunto e conteúdos (tanto texto plano quanto HTML estilizado)
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@agrostand.com',
    to: toEmail,
    subject: 'Recuperação de Senha - Agrostand',
    text: `Olá! Seu código de recuperação de senha é: ${recoveryCode}\nEste código expira em 15 minutos.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2e7d32; text-align: center;">Agrostand</h2>
        <p>Olá,</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no Agrostand.</p>
        <p>Use o código de verificação abaixo para prosseguir com a redefinição de senha:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2e7d32; background-color: #e8f5e9; padding: 10px 20px; border-radius: 4px; border: 1px dashed #2e7d32;">
            ${recoveryCode}
          </span>
        </div>
        <p style="color: #666; font-size: 14px;"><strong>Importante:</strong> Este código é válido por 15 minutos. Se você não solicitou essa alteração, ignore este e-mail.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">Agrostand &copy; 2026</p>
      </div>
    `
  };

  // Obtém o transportador configurado
  const activeTransporter = await getTransporter();
  
  if (activeTransporter && activeTransporter !== 'console') {
    try {
      // Dispara o e-mail assincronamente através do transporte configurado
      const info = await activeTransporter.sendMail(mailOptions);
      logger.info('Recovery email sent', { email: toEmail, messageId: info.messageId });
      
      // Se estiver rodando no Ethereal, podemos capturar o link para visualizar o e-mail no navegador
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        logger.info(`Email preview URL (Ethereal): ${previewUrl}`);
        console.log(`[SMTP TEST] E-mail sent to ${toEmail}. Preview URL: ${previewUrl}`);
      }
      return true;
    } catch (error) {
      logger.error('Failed to send recovery email', error, { email: toEmail });
      throw error;
    }
  } else {
    // Em produção, sem SMTP o código NUNCA vai para o terminal/logs (seria um vazamento).
    if (process.env.NODE_ENV === 'production') {
      logger.error('SMTP não configurado: e-mail de recuperação não enviado', new Error('SMTP ausente'), { email: toEmail });
      return false;
    }
    // Caso o transporte seja 'console' (fallback local de DESENVOLVIMENTO), imprime os detalhes no terminal
    console.log(`\n==================================================`);
    console.log(`[SMTP FALLBACK]`);
    console.log(`Para: ${toEmail}`);
    console.log(`Assunto: Recuperação de Senha - Agrostand`);
    console.log(`Código de Verificação: ${recoveryCode}`);
    console.log(`==================================================\n`);
    return true;
  }
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Notificação transacional (pedido, mensagem, pergunta...). Mesmos três níveis
 * de transporte da recuperação de senha; `link` aponta para o front.
 */
async function sendNotificationEmail(toEmail, { titulo, mensagem, link }) {
  const url = link ? `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}${link}` : null;
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@agrostand.com',
    to: toEmail,
    subject: `${titulo} - AgroMundo`,
    text: `${titulo}

${mensagem || ''}${url ? `

Acesse: ${url}` : ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #E8E5DF; border-radius: 8px;">
        <h2 style="color: #F4770B; margin-top: 0;">AgroMundo</h2>
        <h3 style="color: #252522;">${escaparHtml(titulo)}</h3>
        <p style="color: #444;">${escaparHtml(mensagem)}</p>
        ${url ? `<p><a href="${escaparHtml(url)}" style="background:#F4770B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Ver no AgroMundo</a></p>` : ''}
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">Você recebeu este e-mail porque tem uma conta no AgroMundo.</p>
      </div>
    `,
  };

  const activeTransporter = await getTransporter();
  if (activeTransporter && activeTransporter !== 'console') {
    const info = await activeTransporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log(`[SMTP TEST] Notificação para ${toEmail}. Preview URL: ${previewUrl}`);
    return true;
  }
  if (process.env.NODE_ENV === 'production') return false;
  console.log(`[SMTP FALLBACK] Notificação para ${toEmail}: ${titulo} — ${mensagem || ''}${url ? ` (${url})` : ''}`);
  return true;
}

module.exports = {
  sendRecoveryEmail,
  sendNotificationEmail,
};
