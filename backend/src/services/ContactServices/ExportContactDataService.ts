import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Tag from "../../models/Tag";
import AppError from "../../errors/AppError";

interface Response {
  contact: Record<string, unknown>;
  tickets: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  extraInfo: Record<string, unknown>[];
  exportedAt: Date;
}

const ExportContactDataService = async (
  contactId: string
): Promise<Response> => {
  const contact = await Contact.findByPk(contactId, {
    include: ["extraInfo", { model: Tag, as: "tags" }]
  });

  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  const tickets = await Ticket.findAll({
    where: { contactId: contact.id },
    order: [["createdAt", "ASC"]]
  });

  const messages = await Message.findAll({
    where: { contactId: contact.id },
    order: [["createdAt", "ASC"]]
  });

  const contactData = contact.get({ plain: true }) as Record<string, unknown>;

  return {
    contact: contactData,
    tickets: tickets.map(ticket => ticket.get({ plain: true })),
    messages: messages.map(message => message.get({ plain: true })),
    tags: (contactData.tags as Record<string, unknown>[]) || [],
    extraInfo: (contactData.extraInfo as Record<string, unknown>[]) || [],
    exportedAt: new Date()
  };
};

export default ExportContactDataService;
