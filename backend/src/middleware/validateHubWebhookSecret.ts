import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";

/**
 * NotificameHub subscriptions only accept a bare `url` (no custom headers or
 * HMAC signing field — confirmed against the official Postman collection).
 * The shared secret is therefore embedded as a query param when the webhook
 * URL is registered (see helpers/setChannelHubWebhook.ts) and checked here
 * in constant time to prevent timing attacks.
 */
const validateHubWebhookSecret = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
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

  return next();
};

export default validateHubWebhookSecret;
