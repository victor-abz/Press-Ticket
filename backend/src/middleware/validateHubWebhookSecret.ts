import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import isNewWebhookEvent from "../services/WebhookServices/WebhookDeduplicationService";

const MAX_TIMESTAMP_DIFF_MINUTES = 5;

/**
 * NotificameHub subscriptions only accept a bare `url` (no custom headers or
 * HMAC signing field — confirmed against the official Postman collection).
 * The shared secret is therefore embedded as a query param when the webhook
 * URL is registered (see helpers/setChannelHubWebhook.ts) and checked here
 * in constant time to prevent timing attacks.
 *
 * Beyond the secret, two independent replay-protection layers guard this
 * endpoint: a timestamp freshness check (x-webhook-timestamp) and an
 * eventId deduplication check (WebhookDeduplicationService). Both are
 * best-effort — a channel that omits the field is let through rather than
 * rejected, since NotificameHub does not send these on every channel.
 */
const validateHubWebhookSecret = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const configuredSecret = process.env.HUB_WEBHOOK_SECRET;

  if (!configuredSecret) {
    logger.error(
      "WebhookHub: HUB_WEBHOOK_SECRET não configurado — recusando webhook por segurança"
    );
    throw new AppError("ERR_HUB_WEBHOOK_NOT_CONFIGURED", 503);
  }

  const receivedSecret = (req.query.token as string) || "";

  const expected = Buffer.from(configuredSecret);
  const received = Buffer.from(receivedSecret);

  const isValid =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);

  if (!isValid) {
    logger.warn(
      `WebhookHub: token de webhook inválido recebido para canal "${req.params.channelId}"`
    );
    throw new AppError("ERR_HUB_WEBHOOK_INVALID_TOKEN", 401);
  }

  const webhookTimestamp = req.headers["x-webhook-timestamp"] as
    | string
    | undefined;

  if (webhookTimestamp) {
    const eventTime = parseInt(webhookTimestamp, 10);
    const diffMinutes = Math.abs(Date.now() - eventTime) / 60000;

    if (Number.isNaN(eventTime) || diffMinutes > MAX_TIMESTAMP_DIFF_MINUTES) {
      logger.warn(
        `WebhookHub: timestamp de webhook inválido ou expirado para canal "${req.params.channelId}"`
      );
      throw new AppError("ERR_HUB_WEBHOOK_TIMESTAMP_EXPIRED", 400);
    }
  }
  // Header ausente: não rejeitar — nem todos os canais do NotificameHub
  // enviam x-webhook-timestamp. A deduplicação por eventId abaixo ainda
  // protege contra replay nesse caso.

  const eventId =
    (req.body?.id as string | undefined) ||
    (req.body?.messageId as string | undefined);

  if (eventId) {
    const isNew = await isNewWebhookEvent(eventId, "notificamehub");
    if (!isNew) {
      logger.warn(
        `WebhookHub: evento duplicado "${eventId}" recebido para canal "${req.params.channelId}"`
      );
      res.status(200).json({ status: "duplicate" });
      return;
    }
  }
  // eventId ausente no payload: não rejeitar — deduplicação parcial é
  // melhor que quebrar canais cujo payload não expõe id/messageId.

  next();
};

export default validateHubWebhookSecret;
