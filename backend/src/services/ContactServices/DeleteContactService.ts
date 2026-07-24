import Contact from "../../models/Contact";
import Email from "../../models/Email";
import AppError from "../../errors/AppError";
import sequelize from "../../database";

const DeleteContactService = async (id: string): Promise<void> => {
  const contact = await Contact.findOne({
    where: { id }
  });

  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  await sequelize.transaction(async t => {
    await Email.destroy({ where: { contactId: contact.id }, transaction: t });
    await contact.destroy({ transaction: t });
  });
};

export default DeleteContactService;
