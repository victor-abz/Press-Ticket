import { Op, UniqueConstraintError } from "sequelize";
import WebhookEvent from "../../models/WebhookEvent";
import { logger } from "../../utils/logger";

const DEDUP_WINDOW_MINUTES = 10;

const isNewWebhookEvent = async (
  eventId: string,
  source = "notificamehub"
): Promise<boolean> => {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000);

  await WebhookEvent.destroy({
    where: {
      processedAt: { [Op.lt]: cutoff }
    }
  });

  try {
    await WebhookEvent.create({ eventId, source });
    return true;
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      return false;
    }
    logger.error(err instanceof Error ? err : new Error("Erro interno"), {
      eventId,
      source,
      context: "WebhookDeduplicationService"
    });
    return true;
  }
};

export default isNewWebhookEvent;
