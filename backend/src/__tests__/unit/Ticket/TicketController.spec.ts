import { faker } from "@faker-js/faker";
import { Request, Response } from "express";
import * as TicketController from "../../../controllers/TicketController";
import CreateContactService from "../../../services/ContactServices/CreateContactService";
import Contact from "../../../models/Contact";
import Setting from "../../../models/Setting";
import Ticket from "../../../models/Ticket";
import Whatsapp from "../../../models/Whatsapp";
import { disconnect, truncate } from "../../utils/database";

jest.mock("../../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    fetchSockets: jest.fn().mockResolvedValue([]),
    in: jest.fn(() => ({
      fetchSockets: jest.fn().mockResolvedValue([])
    }))
  }))
}));

const buildRes = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const buildReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    params: {},
    query: {},
    body: {},
    path: "/tickets",
    ...overrides
  } as unknown as Request);

const seedTicketListingSettings = async (): Promise<void> => {
  await Setting.bulkCreate([
    { key: "allTicket", value: "disabled" },
    { key: "ASC", value: "disabled" },
    { key: "created", value: "disabled" }
  ]);
};

const createTestWhatsapp = async (): Promise<Whatsapp> =>
  Whatsapp.create({ name: faker.string.uuid() });

const createTestContact = async (
  overrides: { number?: string; isGroup?: boolean } = {}
): Promise<Contact> => {
  const contact = await CreateContactService({
    name: faker.person.fullName(),
    number: overrides.number ?? "5521999991234"
  });

  if (overrides.isGroup) {
    await contact.update({ isGroup: true });
  }

  return contact;
};

const createTestTicket = async (
  contactId: number,
  whatsappId: number
): Promise<Ticket> =>
  Ticket.create({
    status: "pending",
    contactId,
    whatsappId,
    userId: null,
    queueId: null
  });

const createTicketWithoutContact = async (
  whatsappId: number
): Promise<Ticket> => {
  const createFn = (
    Ticket.create as unknown as (
      attrs: Record<string, unknown>
    ) => Promise<Ticket>
  ).bind(Ticket);

  return createFn({
    status: "pending",
    whatsappId,
    userId: null,
    queueId: null
  });
};

describe("TicketController", () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await truncate();
    await seedTicketListingSettings();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  describe("index", () => {
    it("should mask the contact number when profile is 'user'", async () => {
      const whatsapp = await createTestWhatsapp();
      const contact = await createTestContact();
      await createTestTicket(contact.id, whatsapp.id);

      const req = buildReq({ user: { id: "1", profile: "user" } });
      const res = buildRes();

      await TicketController.index(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.tickets).toHaveLength(1);
      expect(jsonArg.tickets[0].contact.number).toBe("552199999****");
    });

    it("should return the full contact number when profile is 'admin'", async () => {
      const whatsapp = await createTestWhatsapp();
      const contact = await createTestContact();
      await createTestTicket(contact.id, whatsapp.id);

      const req = buildReq({ user: { id: "1", profile: "admin" } });
      const res = buildRes();

      await TicketController.index(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.tickets[0].contact.number).toBe("5521999991234");
    });

    it("should return the full contact number when profile is 'masteradmin'", async () => {
      const whatsapp = await createTestWhatsapp();
      const contact = await createTestContact();
      await createTestTicket(contact.id, whatsapp.id);

      const req = buildReq({ user: { id: "1", profile: "masteradmin" } });
      const res = buildRes();

      await TicketController.index(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.tickets[0].contact.number).toBe("5521999991234");
    });

    it("should return contact: null for a ticket without a contact, without a 500 error", async () => {
      const whatsapp = await createTestWhatsapp();
      await createTicketWithoutContact(whatsapp.id);

      const req = buildReq({ user: { id: "1", profile: "user" } });
      const res = buildRes();

      await TicketController.index(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.tickets).toHaveLength(1);
      expect(jsonArg.tickets[0].contact).toBeNull();
    });

    it("should keep the group contact number intact regardless of profile", async () => {
      const whatsapp = await createTestWhatsapp();
      const groupContact = await createTestContact({
        number: "5521999991234@g.us",
        isGroup: true
      });
      await createTestTicket(groupContact.id, whatsapp.id);

      const req = buildReq({ user: { id: "1", profile: "user" } });
      const res = buildRes();

      await TicketController.index(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.tickets[0].contact.number).toBe("5521999991234@g.us");
    });
  });

  describe("show", () => {
    it("should mask the contact number when profile is 'user'", async () => {
      const whatsapp = await createTestWhatsapp();
      const contact = await createTestContact();
      const ticket = await createTestTicket(contact.id, whatsapp.id);

      const req = buildReq({
        params: { ticketId: String(ticket.id) },
        user: { id: "1", profile: "user" }
      });
      const res = buildRes();

      await TicketController.show(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.contact.number).toBe("552199999****");
    });

    it("should return the full contact number when profile is 'admin'", async () => {
      const whatsapp = await createTestWhatsapp();
      const contact = await createTestContact();
      const ticket = await createTestTicket(contact.id, whatsapp.id);

      const req = buildReq({
        params: { ticketId: String(ticket.id) },
        user: { id: "1", profile: "admin" }
      });
      const res = buildRes();

      await TicketController.show(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.contact.number).toBe("5521999991234");
    });
  });
});
