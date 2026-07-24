import crypto from "crypto";
import { faker } from "@faker-js/faker";
import { sign, decode } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import ActivityLog from "../../../models/ActivityLog";
import User from "../../../models/User";
import UserSession from "../../../models/UserSession";
import AuthUserService from "../../../services/UserServices/AuthUserService";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import * as UserController from "../../../controllers/UserController";
import * as SessionController from "../../../controllers/SessionController";
import { ActivityActions } from "../../../services/ActivityLogService";
import isAuth from "../../../middleware/isAuth";
import { disconnect, truncate } from "../../utils/database";

const TEST_SECRET = "test_jwt_secret";
const TEST_PASSWORD = "Str0ngP@ssw0rd!";

jest.mock("../../../config/auth", () => ({
  __esModule: true,
  default: {
    secret: "test_jwt_secret",
    expiresIn: "8h",
    refreshSecret: "test_jwt_refresh_secret",
    refreshExpiresIn: "1d"
  }
}));

jest.mock("../../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn()
  }))
}));

const buildRes = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

const buildReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    params: {},
    body: {},
    ...overrides
  } as unknown as Request);

const runIsAuth = (req: Request, res: Response): Promise<void> =>
  new Promise((resolve, reject) => {
    const next: NextFunction = ((err?: unknown) => {
      if (err) reject(err);
      else resolve();
    }) as NextFunction;

    isAuth(req, res, next).catch(reject);
  });

const createTestUser = async (
  overrides: { profile?: string } = {}
): Promise<User> => {
  const created = await CreateUserService({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: TEST_PASSWORD,
    startWork: "00:00",
    endWork: "23:59",
    profile: overrides.profile ?? "user"
  });
  const user = await User.findByPk(created.id);
  if (!user) throw new Error("User not found after creation");
  return user;
};

const createActiveSessionFor = async (userId: number): Promise<void> => {
  await UserSession.create({
    userId,
    sessionId: crypto.randomUUID(),
    loginAt: new Date(),
    lastActivity: new Date()
  });
};

const signAccessToken = (user: User): string =>
  sign(
    {
      username: user.name,
      profile: user.profile,
      id: user.id,
      tokenVersion: user.tokenVersion
    },
    TEST_SECRET,
    { expiresIn: "8h" }
  );

describe("tokenVersion — invalidação de sessão", () => {
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

  it("login emite token com tokenVersion igual ao do banco", async () => {
    const email = faker.internet.email();

    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password: TEST_PASSWORD,
      startWork: "00:00",
      endWork: "23:59"
    });

    const { token } = await AuthUserService({
      email,
      password: TEST_PASSWORD
    });

    const decoded = decode(token) as { tokenVersion: number };
    const user = await User.findOne({ where: { email } });

    expect(decoded.tokenVersion).toBe(user!.tokenVersion);
  });

  it("isAuth aceita token com tokenVersion correto", async () => {
    const user = await createTestUser();
    await createActiveSessionFor(user.id);

    const token = signAccessToken(user);
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const res = buildRes();

    await expect(runIsAuth(req, res)).resolves.toBeUndefined();
    expect(req.user).toMatchObject({
      id: user.id,
      profile: user.profile
    });
  });

  it("isAuth rejeita token com tokenVersion desatualizado -> 401", async () => {
    const user = await createTestUser();
    await createActiveSessionFor(user.id);

    const staleToken = sign(
      {
        username: user.name,
        profile: user.profile,
        id: user.id,
        tokenVersion: user.tokenVersion + 1
      },
      TEST_SECRET,
      { expiresIn: "8h" }
    );

    const req = buildReq({
      headers: { authorization: `Bearer ${staleToken}` }
    });
    const res = buildRes();

    await expect(runIsAuth(req, res)).rejects.toMatchObject({
      message: "ERR_SESSION_EXPIRED",
      statusCode: 401
    });
  });

  it("isAuth rejeita token de conta com active=false -> 401", async () => {
    const user = await createTestUser();
    await createActiveSessionFor(user.id);
    await user.update({ active: false });

    const token = signAccessToken(user);
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const res = buildRes();

    await expect(runIsAuth(req, res)).rejects.toMatchObject({
      message: "ERR_SESSION_EXPIRED",
      statusCode: 401
    });
  });

  it("troca de senha própria: tokenVersion incrementa e a resposta contém novo token", async () => {
    const user = await createTestUser();
    const previousTokenVersion = user.tokenVersion;

    const req = buildReq({
      params: { userId: String(user.id) },
      user: { id: String(user.id), profile: user.profile },
      body: {
        password: "N0vaSenh@!23",
        currentPassword: TEST_PASSWORD
      }
    });
    const res = buildRes();

    await UserController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonArg).toHaveProperty("token");
    expect(typeof jsonArg.token).toBe("string");

    const updatedUser = await User.findByPk(user.id);
    expect(updatedUser!.tokenVersion).toBe(previousTokenVersion + 1);

    const log = await ActivityLog.findOne({
      where: { entityId: user.id, action: ActivityActions.PASSWORD_CHANGED }
    });
    expect(log).not.toBeNull();
  });

  it("novo token da troca de senha própria é aceito por isAuth", async () => {
    const user = await createTestUser();
    await createActiveSessionFor(user.id);

    const req = buildReq({
      params: { userId: String(user.id) },
      user: { id: String(user.id), profile: user.profile },
      body: {
        password: "N0vaSenh@!23",
        currentPassword: TEST_PASSWORD
      }
    });
    const res = buildRes();

    await UserController.update(req, res);

    const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
    const newToken = jsonArg.token as string;

    const isAuthReq = buildReq({
      headers: { authorization: `Bearer ${newToken}` }
    });
    const isAuthRes = buildRes();

    await expect(runIsAuth(isAuthReq, isAuthRes)).resolves.toBeUndefined();
  });

  it("token antigo (pré-troca) é rejeitado por isAuth após a troca de senha própria", async () => {
    const user = await createTestUser();
    await createActiveSessionFor(user.id);

    const oldToken = signAccessToken(user);

    const req = buildReq({
      params: { userId: String(user.id) },
      user: { id: String(user.id), profile: user.profile },
      body: {
        password: "N0vaSenh@!23",
        currentPassword: TEST_PASSWORD
      }
    });
    const res = buildRes();

    await UserController.update(req, res);

    const isAuthReq = buildReq({
      headers: { authorization: `Bearer ${oldToken}` }
    });
    const isAuthRes = buildRes();

    await expect(runIsAuth(isAuthReq, isAuthRes)).rejects.toMatchObject({
      message: "ERR_SESSION_EXPIRED",
      statusCode: 401
    });
  });

  it("troca de senha própria sem currentPassword correto -> 401 ERR_INVALID_PASSWORD", async () => {
    const user = await createTestUser();

    const req = buildReq({
      params: { userId: String(user.id) },
      user: { id: String(user.id), profile: user.profile },
      body: {
        password: "N0vaSenh@!23",
        currentPassword: "senha-errada"
      }
    });
    const res = buildRes();

    await expect(UserController.update(req, res)).rejects.toMatchObject({
      message: "ERR_INVALID_PASSWORD",
      statusCode: 401
    });

    const untouchedUser = await User.findByPk(user.id);
    expect(untouchedUser!.tokenVersion).toBe(user.tokenVersion);
  });

  it("admin redefine senha de outro usuário: tokenVersion incrementa, sem token na resposta", async () => {
    const admin = await createTestUser({ profile: "admin" });
    const target = await createTestUser();
    const previousTokenVersion = target.tokenVersion;

    const req = buildReq({
      params: { userId: String(target.id) },
      user: { id: String(admin.id), profile: "admin" },
      body: { password: "N0vaSenh@!23" }
    });
    const res = buildRes();

    await UserController.update(req, res);

    const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonArg).not.toHaveProperty("token");

    const updatedTarget = await User.findByPk(target.id);
    expect(updatedTarget!.tokenVersion).toBe(previousTokenVersion + 1);

    const log = await ActivityLog.findOne({
      where: {
        entityId: target.id,
        action: ActivityActions.ADMIN_PASSWORD_RESET
      }
    });
    expect(log).not.toBeNull();
    expect(log!.userId).toBe(admin.id);
  });

  it("admin desativa conta: tokenVersion incrementa junto com active=false", async () => {
    const admin = await createTestUser({ profile: "admin" });
    const target = await createTestUser();
    const previousTokenVersion = target.tokenVersion;

    const req = buildReq({
      params: { userId: String(target.id) },
      user: { id: String(admin.id), profile: "admin" },
      body: { active: false }
    });
    const res = buildRes();

    await UserController.update(req, res);

    const updatedTarget = await User.findByPk(target.id);
    expect(updatedTarget!.active).toBe(false);
    expect(updatedTarget!.tokenVersion).toBe(previousTokenVersion + 1);

    const log = await ActivityLog.findOne({
      where: {
        entityId: target.id,
        action: ActivityActions.ACCOUNT_DEACTIVATED
      }
    });
    expect(log).not.toBeNull();
  });

  it("reset de senha via 'esqueci minha senha' incrementa tokenVersion e invalida tokens antigos", async () => {
    const user = await createTestUser();
    await createActiveSessionFor(user.id);

    const oldToken = signAccessToken(user);
    const previousTokenVersion = user.tokenVersion;

    const rawResetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(rawResetToken)
      .digest("hex");

    await user.update({
      passwordResetToken: resetTokenHash,
      passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000)
    });

    const req = buildReq({
      body: { token: rawResetToken, newPassword: "N0vaSenh@!23" }
    });
    const res = buildRes();

    await SessionController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const updatedUser = await User.findByPk(user.id);
    expect(updatedUser!.tokenVersion).toBe(previousTokenVersion + 1);
    expect(updatedUser!.passwordResetToken).toBeNull();

    const isAuthReq = buildReq({
      headers: { authorization: `Bearer ${oldToken}` }
    });
    const isAuthRes = buildRes();

    await expect(runIsAuth(isAuthReq, isAuthRes)).rejects.toMatchObject({
      message: "ERR_SESSION_EXPIRED",
      statusCode: 401
    });
  });
});
