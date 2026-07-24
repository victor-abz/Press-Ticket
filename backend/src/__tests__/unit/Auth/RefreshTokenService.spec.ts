import { faker } from "@faker-js/faker";
import { sign } from "jsonwebtoken";
import { Response } from "express";
import User from "../../../models/User";
import UserSession from "../../../models/UserSession";
import { RefreshTokenService } from "../../../services/AuthServices/RefreshTokenService";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import { disconnect, truncate } from "../../utils/database";
import { strongPassword } from "../../utils/strongPassword";

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

const mockRes = (): Partial<Response> => ({
  clearCookie: jest.fn()
});

const buildRefreshToken = (userId: number, tokenVersion: number): string =>
  sign({ id: userId, tokenVersion }, "test_jwt_refresh_secret", {
    expiresIn: "1d"
  });

const createTestUser = async (
  overrides: { startWork?: string; endWork?: string } = {}
): Promise<User> => {
  const created = await CreateUserService({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: strongPassword(),
    startWork: overrides.startWork ?? "00:00",
    endWork: overrides.endWork ?? "23:59"
  });
  const user = await User.findByPk(created.id);
  if (!user) throw new Error("User not found after creation");
  return user;
};

describe("RefreshTokenService", () => {
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

  it("should return newToken, refreshToken and user on valid refresh token with active session", async () => {
    const user = await createTestUser();

    await UserSession.create({
      userId: user.id,
      sessionId: crypto.randomUUID(),
      loginAt: new Date(),
      lastActivity: new Date()
    });

    const token = buildRefreshToken(user.id, user.tokenVersion ?? 0);
    const res = mockRes();

    const response = await RefreshTokenService(res as Response, token);

    expect(response).toHaveProperty("newToken");
    expect(response).toHaveProperty("refreshToken");
    expect(response).toHaveProperty("user");
    expect(response.user.id).toBe(user.id);
  });

  it("should throw ERR_SESSION_EXPIRED for invalid/malformed token", async () => {
    const res = mockRes();

    await expect(
      RefreshTokenService(res as Response, "not.a.valid.token")
    ).rejects.toMatchObject({ message: "ERR_SESSION_EXPIRED", statusCode: 401 });
  });

  it("should throw ERR_SESSION_EXPIRED for token signed with wrong secret", async () => {
    const res = mockRes();
    const fakeToken = sign({ id: 999, tokenVersion: 0 }, "wrong_secret", {
      expiresIn: "1d"
    });

    await expect(
      RefreshTokenService(res as Response, fakeToken)
    ).rejects.toMatchObject({ message: "ERR_SESSION_EXPIRED", statusCode: 401 });
  });

  it("should throw ERR_SESSION_EXPIRED when tokenVersion mismatches (rotated token)", async () => {
    const user = await createTestUser();

    await UserSession.create({
      userId: user.id,
      sessionId: crypto.randomUUID(),
      loginAt: new Date(),
      lastActivity: new Date()
    });

    // Token with incremented tokenVersion — simulates a token from before password change
    const staleToken = buildRefreshToken(user.id, (user.tokenVersion ?? 0) + 1);
    const res = mockRes();

    await expect(
      RefreshTokenService(res as Response, staleToken)
    ).rejects.toMatchObject({ message: "ERR_SESSION_EXPIRED", statusCode: 401 });
  });

  it("should throw ERR_USER_INACTIVE for inactive user with otherwise valid token", async () => {
    const user = await createTestUser();

    await UserSession.create({
      userId: user.id,
      sessionId: crypto.randomUUID(),
      loginAt: new Date(),
      lastActivity: new Date()
    });

    await User.update({ active: false }, { where: { id: user.id } });

    const token = buildRefreshToken(user.id, user.tokenVersion ?? 0);
    const res = mockRes();

    await expect(
      RefreshTokenService(res as Response, token)
    ).rejects.toMatchObject({ message: "ERR_USER_INACTIVE", statusCode: 401 });
  });

  it("should throw ERR_SESSION_EXPIRED when no active session exists (logged out)", async () => {
    const user = await createTestUser();

    // No UserSession — simulates fully logged-out state
    const token = buildRefreshToken(user.id, user.tokenVersion ?? 0);
    const res = mockRes();

    await expect(
      RefreshTokenService(res as Response, token)
    ).rejects.toMatchObject({ message: "ERR_SESSION_EXPIRED", statusCode: 401 });
  });

  it("should throw ERR_SESSION_EXPIRED when session lastActivity exceeded timeout threshold", async () => {
    const user = await createTestUser();

    const expiredTime = new Date(Date.now() - 9 * 60 * 60 * 1000); // 9 hours ago
    await UserSession.create({
      userId: user.id,
      sessionId: crypto.randomUUID(),
      loginAt: expiredTime,
      lastActivity: expiredTime
    });

    const token = buildRefreshToken(user.id, user.tokenVersion ?? 0);
    const res = mockRes();

    await expect(
      RefreshTokenService(res as Response, token)
    ).rejects.toMatchObject({ message: "ERR_SESSION_EXPIRED", statusCode: 401 });
  });
});
