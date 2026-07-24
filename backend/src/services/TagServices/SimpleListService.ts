import { Op, Sequelize } from "sequelize";
import Tag from "../../models/Tag";
import Contact from "../../models/Contact";
import { escapeLikeValue } from "../../helpers/escapeLikeValue";

interface Request {
  searchParam?: string;
}

const ListService = async ({ searchParam }: Request): Promise<Tag[]> => {
  let whereCondition = {};

  if (searchParam) {
    const sanitizedSearchParam = escapeLikeValue(searchParam);
    whereCondition = {
      [Op.or]: [
        { name: { [Op.like]: `%${sanitizedSearchParam}%` } },
        { color: { [Op.like]: `%${sanitizedSearchParam}%` } }
      ]
    };
  }

  const tags = await Tag.findAll({
    where: whereCondition,
    order: [["name", "ASC"]],
    include: [
      {
        model: Contact,
        as: "contacts"
      }
    ],
    attributes: {
      exclude: ["createdAt", "updatedAt"],
      include: [
        [Sequelize.fn("COUNT", Sequelize.col("contacts.id")), "contactsCount"]
      ]
    },
    group: [
      "Tag.id",
      "contacts.ContactTag.tagId",
      "contacts.ContactTag.contactId",
      "contacts.ContactTag.createdAt",
      "contacts.ContactTag.updatedAt",
      "contacts.id"
    ]
  });

  return tags;
};

export default ListService;
