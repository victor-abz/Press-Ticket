import { getWbot } from "../../libs/wbot";
import { logger } from "../../utils/logger";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { getIO } from "../../libs/socket";
import { Poll } from "whatsapp-web.js";
import { withSerializedContact } from "../../helpers/serializeContact";
import emitMaskedToSockets from "../../helpers/emitMaskedToSockets";

interface PollOption {
  name: string;
}

interface SendPollData {
  ticketId: number;
  pollName: string;
  options: PollOption[];
  allowMultipleAnswers?: boolean;
}

class SendPollService {
  async execute(data: SendPollData): Promise<Message> {
    const { ticketId, pollName, options, allowMultipleAnswers = false } = data;

    try {
      if (!pollName || pollName.trim() === "") {
        throw new AppError("Nome da enquete é obrigatório");
      }

      if (!options || options.length < 2) {
        throw new AppError("A enquete deve ter no mínimo 2 opções");
      }

      if (options.length > 12) {
        throw new AppError("A enquete pode ter no máximo 12 opções");
      }

      const ticket = await Ticket.findByPk(ticketId, {
        include: [{ model: Contact, as: "contact" }]
      });

      if (!ticket) {
        throw new AppError("Ticket não encontrado");
      }

      const wbot = getWbot(ticket.whatsappId);

      const state = await wbot.getState();
      if (state !== "CONNECTED") {
        throw new AppError("WhatsApp não está conectado");
      }

      const pollOptions = options.map(opt => opt.name);

      const chatId = ticket.contact.number!.includes("@")
        ? ticket.contact.number!
        : `${ticket.contact.number!}@c.us`;

      // wwebjs Poll constructor options type is incomplete — cast needed
      const poll = new Poll(pollName, pollOptions, {
        allowMultipleAnswers: allowMultipleAnswers || false
      } as unknown as ConstructorParameters<typeof Poll>[2]);

      const sentMessage = await wbot.sendMessage(chatId, poll);

      const messageBody = `📊 Enquete: ${pollName}\n\nOpções:\n${pollOptions.map((opt, i) => `${i + 1}. ${opt}`).join("\n")}`;

      const message = await Message.create({
        id: sentMessage.id.id,
        ticketId: ticket.id,
        contactId: ticket.contactId,
        body: messageBody,
        fromMe: true,
        read: true,
        mediaType: "poll",
        quotedMsgId: undefined,
        ack: 1
      });

      await ticket.update({
        lastMessage: `📊 Enquete: ${pollName}`
      });

      await ticket.reload({
        include: [
          { model: Contact, as: "contact" },
          { model: (await import("../../models/Queue")).default, as: "queue" },
          { model: (await import("../../models/User")).default, as: "user" },
          {
            model: (await import("../../models/Whatsapp")).default,
            as: "whatsapp"
          }
        ]
      });

      const io = getIO();
      const ticketJson = ticket.toJSON() as unknown as Record<string, unknown>;

      await emitMaskedToSockets({
        io,
        rooms: [ticket.id.toString(), `ticket-${ticket.id}`, "notification"],
        event: "appMessage",
        buildPayload: profile => {
          const maskedTicket = withSerializedContact(ticketJson, profile);
          return {
            action: "create",
            message,
            ticket: maskedTicket,
            contact: maskedTicket.contact
          };
        }
      });

      await emitMaskedToSockets({
        io,
        rooms: [ticket.status, "notification"],
        event: "ticket",
        buildPayload: profile => ({
          action: "update",
          ticket: withSerializedContact(ticketJson, profile)
        })
      });

      return message;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[POLL] Erro ao enviar enquete: ${errMsg}`);
      throw new AppError(`Erro ao enviar enquete: ${errMsg}`);
    }
  }
}

export default new SendPollService();
