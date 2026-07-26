import { getIO } from "../../libs/socket";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import {
  withSerializedContact,
  withMaskedMessageContacts
} from "../../helpers/serializeContact";
import emitMaskedToSockets from "../../helpers/emitMaskedToSockets";

interface MessageData {
  id: string;
  contactId: number;
  body: string;
  ticketId: number;
  read?: boolean;
  fromMe: boolean;
  fileName?: string;
  mediaType?: string;
  originalName?: string;
}

interface MessageCreationAttributes {
  id: string;
  contactId: number;
  body: string;
  ticketId: number;
  fromMe: boolean;
  read?: boolean;
  ack: number;
  mediaUrl?: string;
  mediaType?: string;
}

const CreateMessageService = async (
  messageData: MessageData
): Promise<Message | undefined> => {
  const { id, contactId, body, ticketId, read, fromMe, fileName, mediaType } =
    messageData;

  if ((!body || body === "") && (!fileName || fileName === "")) {
    return;
  }

  const data: MessageCreationAttributes = {
    id,
    contactId,
    body,
    ticketId,
    fromMe,
    read,
    ack: 2
  };

  if (fileName) {
    data.mediaUrl = fileName;
    data.mediaType = mediaType === "photo" ? "image" : mediaType;
  } else {
    data.mediaType = "chat";
  }

  // Determine preview text for ticket list
  let lastMessage: string;
  if (!fileName) {
    lastMessage = body || "";
  } else {
    const mt = mediaType === "photo" ? "image" : mediaType || "";
    lastMessage =
      mt === "image"
        ? "📷 Imagem"
        : mt === "video"
          ? "🎥 Vídeo"
          : mt === "audio"
            ? "🎵 Áudio"
            : "📎 Arquivo";
  }

  try {
    const newMessage = await Message.create(data);

    const message = await Message.findByPk(messageData.id, {
      include: [
        "contact",
        {
          model: Ticket,
          as: "ticket",
          include: [
            "contact",
            "queue",
            {
              model: Whatsapp,
              as: "whatsapp",
              attributes: ["name", "type"]
            }
          ]
        },
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    if (message) {
      // Update lastMessage on ticket
      if (lastMessage) {
        await Ticket.update({ lastMessage }, { where: { id: ticketId } });
        message.ticket.lastMessage = lastMessage;
      }

      const io = getIO();
      const ticketJson = message.ticket.toJSON() as unknown as Record<
        string,
        unknown
      >;
      const messageJson = message.toJSON() as unknown as Record<
        string,
        unknown
      >;

      await emitMaskedToSockets({
        io,
        rooms: [
          message.ticketId.toString(),
          message.ticket.status,
          "notification"
        ],
        event: "appMessage",
        buildPayload: profile => {
          const serializedTicket = withSerializedContact(ticketJson, profile);
          return {
            action: "create",
            message: withMaskedMessageContacts(messageJson, profile),
            ticket: serializedTicket,
            contact: serializedTicket.contact
          };
        }
      });

      await emitMaskedToSockets({
        io,
        rooms: [message.ticket.status, "notification", ticketId.toString()],
        event: "ticket",
        buildPayload: profile => ({
          action: "update",
          ticket: withSerializedContact(ticketJson, profile)
        })
      });
    }

    return newMessage;
  } catch (error) {
    logger.error(`Erro: ${error}`);
  }
};

export default CreateMessageService;
