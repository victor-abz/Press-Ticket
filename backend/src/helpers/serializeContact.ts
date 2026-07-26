import maskPhoneNumber from "./maskPhoneNumber";

type ContactLike = {
  number?: string | null;
  isGroup?: boolean;
  [key: string]: unknown;
};

const isAdminProfile = (profile: string): boolean =>
  profile === "admin" || profile === "masteradmin";

const serializeContact = (
  contact: ContactLike,
  userProfile: string
): ContactLike => ({
  ...contact,
  number:
    isAdminProfile(userProfile) || contact.isGroup
      ? contact.number
      : maskPhoneNumber(contact.number as string)
});

const serializeContacts = (
  contacts: ContactLike[],
  userProfile: string
): ContactLike[] => contacts.map(contact => serializeContact(contact, userProfile));

const withSerializedContact = (
  entityJson: Record<string, unknown>,
  userProfile: string
): Record<string, unknown> => ({
  ...entityJson,
  contact: entityJson.contact
    ? serializeContact(entityJson.contact as ContactLike, userProfile)
    : null
});

/**
 * Mascara todos os pontos onde uma mensagem pode carregar um contato:
 * o contato do próprio remetente, o contato do ticket associado e o
 * contato do ticket da mensagem citada (quotedMsg) — só aplica quando
 * o campo foi de fato eager-loaded pela query que originou o payload.
 */
const withMaskedMessageContacts = (
  messageJson: Record<string, unknown>,
  userProfile: string
): Record<string, unknown> => {
  const ticket = messageJson.ticket as Record<string, unknown> | undefined;
  const quotedMsg = messageJson.quotedMsg as
    | Record<string, unknown>
    | undefined;

  return {
    ...messageJson,
    contact: messageJson.contact
      ? serializeContact(messageJson.contact as ContactLike, userProfile)
      : messageJson.contact,
    ticket: ticket ? withSerializedContact(ticket, userProfile) : ticket,
    quotedMsg: quotedMsg
      ? {
          ...quotedMsg,
          contact: quotedMsg.contact
            ? serializeContact(quotedMsg.contact as ContactLike, userProfile)
            : quotedMsg.contact
        }
      : quotedMsg
  };
};

export {
  serializeContact,
  serializeContacts,
  withSerializedContact,
  withMaskedMessageContacts
};
