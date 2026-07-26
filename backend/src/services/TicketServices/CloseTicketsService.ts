import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import { withSerializedContact } from "../../helpers/serializeContact";
import emitMaskedToSockets from "../../helpers/emitMaskedToSockets";

interface Request {
  status?: string;
  userId: number;
  tickets: Ticket[];
  queueId?: number;
}

const CloseTicketsService = async ({
  status: _status,
  userId,
  tickets
}: Request): Promise<void> => {
  const io = getIO();
  const promises = [];

  for (const ticket of tickets) {
    const oldStatus = ticket.status;

    promises.push(
      (async () => {
        await ticket.update({
          status: "closed",
          userId
        });

        if (ticket.status === "closed" && ticket.isGroup === false) {
          const whatsapp = await ShowWhatsAppService(ticket.whatsappId);
          const { farewellMessage } = whatsapp;

          if (farewellMessage) {
            await SendWhatsAppMessage({
              body: formatBody(`\u200e${farewellMessage}`, ticket),
              ticket
            });
          }
        }

        io.to(oldStatus).emit("ticket", {
          action: "delete",
          ticketId: ticket.id
        });

        const ticketJson = ticket.toJSON() as unknown as Record<
          string,
          unknown
        >;
        await emitMaskedToSockets({
          io,
          rooms: [ticket.status, "notification", ticket.id.toString()],
          event: "ticket",
          buildPayload: profile => ({
            action: "update",
            ticket: withSerializedContact(ticketJson, profile)
          })
        });
      })()
    );
  }

  await Promise.all(promises);
};

export default CloseTicketsService;
