import { Request, Response } from "express";
import { faker } from "@faker-js/faker";
import ActivityLog from "../../../models/ActivityLog";
import User from "../../../models/User";
import AuthUserService from "../../../services/UserServices/AuthUserService";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import * as UserController from "../../../controllers/UserController";
import { ActivityActions } from "../../../services/ActivityLogService";
import { disconnect, truncate } from "../../utils/database";

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
  return res;
};

const buildReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    params: {},
    ...overrides
  } as unknown as Request);

const strongPassword = (): string =>
  `Senha@${faker.string.alphanumeric(6)}1`;

const createTestUser = async (): Promise<{ email: string; password: string }> => {
  const email = faker.internet.email();
  const password = strongPassword();

  await CreateUserService({
    name: faker.person.fullName(),
    email,
    password,
    startWork: "00:00",
    endWork: "23:59"
  });

  return { email, password };
};

const failLoginNTimes = async (
  email: string,
  times: number
): Promise<unknown> => {
  let lastError: unknown;
  for (let i = 0; i < times; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await AuthUserService({ email, password: faker.internet.password() });
    } catch (error) {
      lastError = error;
    }
  }
  return lastError;
};

describe("Login lockout", () => {
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

  it("should succeed on correct credentials and reset loginAttempts", async () => {
    const { email, password } = await createTestUser();

    await User.update({ loginAttempts: 3 }, { where: { email } });

    const response = await AuthUserService({ email, password });

    expect(response).toHaveProperty("token");

    const user = await User.findOne({ where: { email } });
    expect(user!.loginAttempts).toBe(0);
  });

  it("should throw ERR_INVALID_CREDENTIALS and increment loginAttempts on wrong password", async () => {
    const { email } = await createTestUser();

    await expect(
      AuthUserService({ email, password: faker.internet.password() })
    ).rejects.toMatchObject({
      message: "ERR_INVALID_CREDENTIALS",
      statusCode: 401
    });

    const user = await User.findOne({ where: { email } });
    expect(user!.loginAttempts).toBe(1);
  });

  it("should throw the same ERR_INVALID_CREDENTIALS/401 for a non-existent email as for a wrong password", async () => {
    const { email } = await createTestUser();

    const wrongPasswordError = await AuthUserService({
      email,
      password: faker.internet.password()
    }).catch(error => error);

    const unknownEmailError = await AuthUserService({
      email: faker.internet.email(),
      password: faker.internet.password()
    }).catch(error => error);

    expect(wrongPasswordError).toMatchObject({
      message: "ERR_INVALID_CREDENTIALS",
      statusCode: 401
    });
    expect(unknownEmailError).toMatchObject({
      message: "ERR_INVALID_CREDENTIALS",
      statusCode: 401
    });
    expect(unknownEmailError.message).toBe(wrongPasswordError.message);
    expect(unknownEmailError.statusCode).toBe(wrongPasswordError.statusCode);
  });

  it("should lock the account on the 10th failed attempt (423), reset loginAttempts and increment lockCount", async () => {
    const { email } = await createTestUser();

    const error = await failLoginNTimes(email, 10);

    expect(error).toMatchObject({ statusCode: 423 });

    const user = await User.findOne({ where: { email } });
    expect(user!.loginAttempts).toBe(0);
    expect(user!.lockCount).toBe(1);
    expect(user!.lockedUntil).not.toBeNull();
    expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("should return 423 without incrementing loginAttempts when the account is already locked", async () => {
    const { email, password } = await createTestUser();

    await User.update(
      {
        lockedUntil: new Date(Date.now() + 15 * 60000),
        lockCount: 1,
        loginAttempts: 0
      },
      { where: { email } }
    );

    await expect(
      AuthUserService({ email, password })
    ).rejects.toMatchObject({ statusCode: 423 });

    const user = await User.findOne({ where: { email } });
    expect(user!.loginAttempts).toBe(0);
  });

  it("should double the lockout duration on the second lock (progressive backoff)", async () => {
    const { email } = await createTestUser();

    const firstLockError = await failLoginNTimes(email, 10);
    expect(firstLockError).toMatchObject({ statusCode: 423 });

    const userAfterFirstLock = await User.findOne({ where: { email } });
    const firstLockMinutes = Math.round(
      (userAfterFirstLock!.lockedUntil!.getTime() - Date.now()) / 60000
    );
    expect(userAfterFirstLock!.lockCount).toBe(1);
    expect(firstLockMinutes).toBeGreaterThanOrEqual(14);
    expect(firstLockMinutes).toBeLessThanOrEqual(15);

    // Simulate the first lockout expiring, keeping lockCount for progressive backoff
    await User.update(
      { lockedUntil: null, loginAttempts: 0 },
      { where: { email } }
    );

    const secondLockError = await failLoginNTimes(email, 10);
    expect(secondLockError).toMatchObject({ statusCode: 423 });

    const userAfterSecondLock = await User.findOne({ where: { email } });
    const secondLockMinutes = Math.round(
      (userAfterSecondLock!.lockedUntil!.getTime() - Date.now()) / 60000
    );
    expect(userAfterSecondLock!.lockCount).toBe(2);
    expect(secondLockMinutes).toBeGreaterThanOrEqual(29);
    expect(secondLockMinutes).toBeLessThanOrEqual(30);
  });

  it("should allow login after lockout expires, clearing lockedUntil but keeping lockCount", async () => {
    const { email, password } = await createTestUser();

    await User.update(
      {
        lockedUntil: new Date(Date.now() - 60000),
        lockCount: 2,
        loginAttempts: 0
      },
      { where: { email } }
    );

    const response = await AuthUserService({ email, password });

    expect(response).toHaveProperty("token");

    const user = await User.findOne({ where: { email } });
    expect(user!.lockedUntil).toBeNull();
    expect(user!.lockCount).toBe(2);
  });

  it("should allow an admin to unlock a locked user via POST /users/:userId/unlock", async () => {
    const { email } = await createTestUser();
    const user = await User.findOne({ where: { email } });

    await user!.update({
      loginAttempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60000),
      lockCount: 1
    });

    const admin = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword(),
      profile: "admin",
      startWork: "00:00",
      endWork: "23:59"
    });

    const req = buildReq({
      user: { id: String(admin.id), profile: "admin" },
      params: { userId: String(user!.id) }
    });
    const res = buildRes();

    await UserController.unlockUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Conta desbloqueada com sucesso."
    });

    const unlockedUser = await User.findOne({ where: { email } });
    expect(unlockedUser!.loginAttempts).toBe(0);
    expect(unlockedUser!.lockedUntil).toBeNull();
    expect(unlockedUser!.lockCount).toBe(0);

    const log = await ActivityLog.findOne({
      where: { entityId: user!.id, action: ActivityActions.ACCOUNT_UNLOCKED }
    });
    expect(log).not.toBeNull();
  });

  it("should return 403 when a regular user tries to unlock an account", async () => {
    const { email } = await createTestUser();
    const user = await User.findOne({ where: { email } });

    const regularUser = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword(),
      profile: "user",
      startWork: "00:00",
      endWork: "23:59"
    });

    const req = buildReq({
      user: { id: String(regularUser.id), profile: "user" },
      params: { userId: String(user!.id) }
    });
    const res = buildRes();

    await expect(UserController.unlockUser(req, res)).rejects.toMatchObject({
      message: "ERR_NO_PERMISSION",
      statusCode: 403
    });
  });
});
