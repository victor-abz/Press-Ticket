import { faker } from "@faker-js/faker";
import { Request, Response } from "express";
import * as ContactController from "../../../controllers/ContactController";
import CreateContactService from "../../../services/ContactServices/CreateContactService";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import { serializeContact } from "../../../helpers/serializeContact";
import { disconnect, truncate } from "../../utils/database";

jest.mock("../../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn(),
    fetchSockets: jest.fn().mockResolvedValue([]),
    in: jest.fn(() => ({
      fetchSockets: jest.fn().mockResolvedValue([])
    })),
    to: jest.fn().mockReturnThis()
  }))
}));

jest.mock("../../../services/WbotServices/CheckIsValidContact", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
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
    ...overrides
  } as unknown as Request);

const createTestContact = async (): Promise<Awaited<ReturnType<typeof CreateContactService>>> =>
  CreateContactService({
    name: faker.person.fullName(),
    number: "5521999991234"
  });

const createTestUser = async (
  profile: string
): Promise<{ id: string; profile: string }> => {
  const user = await CreateUserService({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: "Str0ngP@ssw0rd!",
    startWork: "00:00",
    endWork: "23:59",
    profile
  });
  return { id: String(user.id), profile };
};

describe("ContactController", () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await truncate();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  describe("index", () => {
    it("should mask the contact number when profile is 'user'", async () => {
      await createTestContact();

      const req = buildReq({
        query: { searchParam: "", pageNumber: "1" } as unknown as Request["query"],
        user: { id: "1", profile: "user" }
      });
      const res = buildRes();

      await ContactController.index(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.contacts).toHaveLength(1);
      expect(jsonArg.contacts[0].number).toBe("552199999****");
    });

    it("should return the full contact number when profile is 'admin'", async () => {
      await createTestContact();

      const req = buildReq({
        query: { searchParam: "", pageNumber: "1" } as unknown as Request["query"],
        user: { id: "1", profile: "admin" }
      });
      const res = buildRes();

      await ContactController.index(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.contacts[0].number).toBe("5521999991234");
    });

    it("should return the full contact number when profile is 'masteradmin'", async () => {
      await createTestContact();

      const req = buildReq({
        query: { searchParam: "", pageNumber: "1" } as unknown as Request["query"],
        user: { id: "1", profile: "masteradmin" }
      });
      const res = buildRes();

      await ContactController.index(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.contacts[0].number).toBe("5521999991234");
    });
  });

  describe("show", () => {
    it("should mask the contact number when profile is 'user'", async () => {
      const contact = await createTestContact();

      const req = buildReq({
        params: { contactId: String(contact.id) },
        user: { id: "1", profile: "user" }
      });
      const res = buildRes();

      await ContactController.show(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.number).toBe("552199999****");
    });

    it("should return the full contact number when profile is 'admin'", async () => {
      const contact = await createTestContact();

      const req = buildReq({
        params: { contactId: String(contact.id) },
        user: { id: "1", profile: "admin" }
      });
      const res = buildRes();

      await ContactController.show(req, res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.number).toBe("5521999991234");
    });
  });

  describe("update", () => {
    it("should reject with ERR_NO_PERMISSION/403 when profile 'user' tries to change number", async () => {
      const contact = await createTestContact();

      const req = buildReq({
        params: { contactId: String(contact.id) },
        user: { id: "1", profile: "user" },
        body: { number: "5521888882222" }
      });
      const res = buildRes();

      await expect(ContactController.update(req, res)).rejects.toMatchObject({
        message: "ERR_NO_PERMISSION",
        statusCode: 403
      });
    });

    it("should allow profile 'admin' to change the number -> 200", async () => {
      const contact = await createTestContact();
      const admin = await createTestUser("admin");

      const req = buildReq({
        params: { contactId: String(contact.id) },
        user: admin,
        body: { number: "5521888882222" }
      });
      const res = buildRes();

      await ContactController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.number).toBe("5521888882222");
    });

    it("should allow profile 'user' to update other fields when number is not present -> 200", async () => {
      const contact = await createTestContact();
      const attendant = await createTestUser("user");
      const newName = faker.person.fullName();

      const req = buildReq({
        params: { contactId: String(contact.id) },
        user: attendant,
        body: { name: newName }
      });
      const res = buildRes();

      await ContactController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.name).toBe(newName);
    });
  });
});

describe("serializeContact — contatos de grupo", () => {
  it("não mascara number de contato com isGroup: true para perfil user", () => {
    const group = {
      number: "5521999991234@g.us",
      isGroup: true,
    };
    const result = serializeContact(group, "user");
    expect(result.number).toBe("5521999991234@g.us");
  });

  it("não mascara number de contato com isGroup: true para perfil admin", () => {
    const group = {
      number: "5521999991234@g.us",
      isGroup: true,
    };
    const result = serializeContact(group, "admin");
    expect(result.number).toBe("5521999991234@g.us");
  });

  it("mascara number de contato com isGroup: false para perfil user", () => {
    const contact = {
      number: "5521999991234",
      isGroup: false,
    };
    const result = serializeContact(contact, "user");
    expect(result.number).toBe("552199999****");
  });

  it("não mascara number de contato com isGroup: false para perfil admin", () => {
    const contact = {
      number: "5521999991234",
      isGroup: false,
    };
    const result = serializeContact(contact, "admin");
    expect(result.number).toBe("5521999991234");
  });
});
