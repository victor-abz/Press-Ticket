import { faker } from "@faker-js/faker";
import User from "../../../models/User";
import { strongPassword } from "../../utils/strongPassword";
import UserSession from "../../../models/UserSession";
import AuthUserService from "../../../services/UserServices/AuthUserService";
import CreateUserService from "../../../services/UserServices/CreateUserService";
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

describe("AuthUserService", () => {
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

  it("should return token, refreshToken and serializedUser on valid credentials", async () => {
    const password = strongPassword();
    const email = faker.internet.email();

    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password,
      startWork: "00:00",
      endWork: "23:59"
    });

    const response = await AuthUserService({ email, password });

    expect(response).toHaveProperty("token");
    expect(response).toHaveProperty("refreshToken");
    expect(response).toHaveProperty("serializedUser");
    expect(response.serializedUser.email).toBe(email);
  });

  it("should throw ERR_INVALID_CREDENTIALS for unregistered email", async () => {
    await expect(
      AuthUserService({
        email: faker.internet.email(),
        password: faker.internet.password()
      })
    ).rejects.toMatchObject({ message: "ERR_INVALID_CREDENTIALS", statusCode: 401 });
  });

  it("should throw ERR_INVALID_CREDENTIALS for wrong password", async () => {
    const email = faker.internet.email();

    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password: strongPassword(),
      startWork: "00:00",
      endWork: "23:59"
    });

    await expect(
      AuthUserService({ email, password: faker.internet.password() })
    ).rejects.toMatchObject({ message: "ERR_INVALID_CREDENTIALS", statusCode: 401 });
  });

  it("should throw ERR_USER_INACTIVE for inactive user", async () => {
    const email = faker.internet.email();
    const password = strongPassword();

    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password,
      startWork: "00:00",
      endWork: "23:59"
    });

    await User.update({ active: false }, { where: { email } });

    await expect(
      AuthUserService({ email, password })
    ).rejects.toMatchObject({ message: "ERR_USER_INACTIVE", statusCode: 401 });
  });

  it("should throw ERR_OUT_OF_HOURS when login is outside working hours", async () => {
    const email = faker.internet.email();
    const password = strongPassword();

    // Zero-width window ensures current time never satisfies start == end
    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password,
      startWork: "23:59",
      endWork: "23:59"
    });

    await expect(
      AuthUserService({ email, password })
    ).rejects.toMatchObject({ message: "ERR_OUT_OF_HOURS", statusCode: 401 });
  });

  it("should set user online status to true after successful login", async () => {
    const email = faker.internet.email();
    const password = strongPassword();

    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password,
      startWork: "00:00",
      endWork: "23:59"
    });

    await AuthUserService({ email, password });

    const updatedUser = await User.findOne({ where: { email } });
    expect(updatedUser?.online).toBe(true);
  });

  it("should close expired session and allow re-login when session exceeded timeout", async () => {
    const email = faker.internet.email();
    const password = strongPassword();

    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password,
      startWork: "00:00",
      endWork: "23:59"
    });

    // First login creates a session
    await AuthUserService({ email, password });

    const user = await User.findOne({ where: { email } });
    const oldSession = await UserSession.findOne({
      where: { userId: user!.id, logoutAt: null }
    });

    // Back-date lastActivity to simulate a timed-out session (9 hours ago)
    const expiredTime = new Date(Date.now() - 9 * 60 * 60 * 1000);
    await UserSession.update(
      { lastActivity: expiredTime },
      { where: { userId: user!.id, logoutAt: null } }
    );

    // Second login should succeed: expired session closed, new session created
    const response = await AuthUserService({ email, password });

    expect(response).toHaveProperty("token");

    // Old session should now have logoutAt set
    await oldSession!.reload();
    expect(oldSession!.logoutAt).not.toBeNull();

    // A new session should exist with a recent lastActivity
    const newSession = await UserSession.findOne({
      where: { userId: user!.id, logoutAt: null }
    });
    expect(newSession).not.toBeNull();
    expect(newSession!.id).not.toBe(oldSession!.id);
  });
});
