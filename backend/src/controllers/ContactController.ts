import { Request, Response } from "express";
import * as Yup from "yup";
import { getIO } from "../libs/socket";

import CreateContactService from "../services/ContactServices/CreateContactService";
import DeleteAllContactService from "../services/ContactServices/DeleteAllContactService";
import DeleteContactService from "../services/ContactServices/DeleteContactService";
import ListContactsService from "../services/ContactServices/ListContactsService";
import ShowContactService from "../services/ContactServices/ShowContactService";
import UpdateContactService from "../services/ContactServices/UpdateContactService";

import AppError from "../errors/AppError";
import GetContactService from "../services/ContactServices/GetContactService";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  tags?: string;
};

type IndexGetContactQuery = {
  name: string;
  number: string;
  address: string;
  email: string;
};

interface ExtraInfo {
  name: string;
  value: string;
}
interface ContactData {
  name: string;
  number: string;
  address?: string;
  email?: string;
  messengerId?: string;
  instagramId?: string;
  telegramId?: string;
  extraInfo?: ExtraInfo[];
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, tags } = req.query as IndexQuery;

  const tagIds = tags ? tags.split(",").map(tag => Number(tag)) : [];

  const { contacts, count, hasMore } = await ListContactsService({
    searchParam,
    pageNumber,
    tags: tagIds
  });

  return res.json({ contacts, count, hasMore });
};

export const getContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name, number, address, email } = req.body as IndexGetContactQuery;

  const contact = await GetContactService({
    name,
    number,
    address,
    email
  });

  return res.status(200).json(contact);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;
  newContact.number = newContact.number.replace("-", "").replace(" ", "");

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    number: Yup.string()
      .required()
      .matches(/^\d+$/, "Invalid number format. Only numbers is allowed.")
  });

  try {
    await schema.validate(newContact);
  } catch (err) {
    throw new AppError(err.message);
  }

  await CheckIsValidContact(newContact.number);
  const validNumber: any = await CheckContactNumber(newContact.number);

  const profilePicUrl = await GetProfilePicUrl(validNumber);

  let { name } = newContact;
  let number = validNumber;
  let { address } = newContact;
  let { email } = newContact;
  let { extraInfo } = newContact;

  const contact = await CreateContactService({
    name,
    number,
    address,
    email,
    extraInfo,
    profilePicUrl
  });

  const io = getIO();
  io.emit("contact", {
    action: "create",
    contact
  });

  return res.status(200).json(contact);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { contactId } = req.params;
  const contact = await ShowContactService(contactId);
  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const contactData: ContactData = req.body;

  const schema = Yup.object().shape({
    name: Yup.string()
  });

  try {
    await schema.validate(contactData);
  } catch (err) {
    throw new AppError(err.message);
  }

  if (
    !contactData.messengerId &&
    !contactData.instagramId &&
    !contactData.telegramId
  ) {
    await CheckIsValidContact(contactData.number);
  }

  const { contactId } = req.params;

  const contact = await UpdateContactService({ contactData, contactId });

  const io = getIO();
  io.emit("contact", {
    action: "update",
    contact
  });

  return res.status(200).json(contact);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;

  await DeleteContactService(contactId);

  const io = getIO();
  io.emit("contact", {
    action: "delete",
    contactId
  });

  return res.status(200).json({ message: "Contact deleted" });
};

export const removeAll = async (
  req: Request,
  res: Response
): Promise<Response> => {
  await DeleteAllContactService();

  return res.send();
};
