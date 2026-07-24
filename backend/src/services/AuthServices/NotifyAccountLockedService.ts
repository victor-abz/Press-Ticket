import sanitizeHtml from "sanitize-html";
import User from "../../models/User";
import EmailService from "../EmailService";
import { logger } from "../../utils/logger";

interface Request {
  user: User;
  lockedUntil: Date;
}

const sanitizeText = (value: string): string =>
  sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });

const NotifyAccountLockedService = async ({
  user,
  lockedUntil
}: Request): Promise<void> => {
  try {
    const lockedUntilFormatted = lockedUntil.toLocaleString("pt-BR", {
      timeZone: process.env.TZ || "America/Sao_Paulo"
    });
    const safeName = sanitizeText(user.name);

    const emailService = EmailService.getInstance();

    const sent = await emailService.sendEmail({
      to: user.email,
      subject: "Sua conta foi temporariamente bloqueada",
      text: `Olá, ${safeName}. Detectamos múltiplas tentativas de login sem sucesso na sua conta. Por segurança, o acesso foi bloqueado até ${lockedUntilFormatted}. Se você não reconhece essas tentativas, recomendamos alterar sua senha assim que o bloqueio expirar.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Conta temporariamente bloqueada</h2>
          <p>Olá, <strong>${safeName}</strong>.</p>
          <p>
            Detectamos múltiplas tentativas de login sem sucesso na sua conta.
            Por segurança, o acesso foi bloqueado até
            <strong>${lockedUntilFormatted}</strong>.
          </p>
          <p>
            Se você não reconhece essas tentativas, recomendamos alterar sua senha
            assim que o bloqueio expirar.
          </p>
          <p>
            Se foi você mesmo, aguarde o desbloqueio automático ou entre em contato
            com um administrador do sistema.
          </p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #777;">Este é um e-mail automático, não responda.</p>
        </div>
      `
    });

    if (!sent) {
      logger.error(
        `Não foi possível enviar e-mail de bloqueio de conta para ${user.email}`
      );
    }
  } catch (error) {
    logger.error(`Erro ao notificar bloqueio de conta: ${error}`);
  }
};

export default NotifyAccountLockedService;
