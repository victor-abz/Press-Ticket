import { faker } from "@faker-js/faker";
import AppError from "../../../errors/AppError";
import User from "../../../models/User";
import AuthUserService from "../../../services/UserServices/AuthUserService";
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

describe("Auth", () => {
  beforeEach(async () => {
    await truncate();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  it("should be able to login with an existing user", async () => {
    const password = strongPassword();
    const email = faker.internet.email();

    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password,
      startWork: "00:00",
      endWork: "23:59"
    });

    const response = await AuthUserService({
      email,
      password
    });

    expect(response).toHaveProperty("token");
  });

  it("should not be able to login with not registered email", async () => {
    try {
      await AuthUserService({
        email: faker.internet.email(),
        password: faker.internet.password()
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("ERR_INVALID_CREDENTIALS");
    }
  });

  it("should not be able to login with incorret password", async () => {
    await CreateUserService({
      name: faker.person.fullName(),
      email: "mail@test.com",
      password: strongPassword(),
      startWork: "00:00",
      endWork: "23:59"
    });

    try {
      await AuthUserService({
        email: "mail@test.com",
        password: faker.internet.password()
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("ERR_INVALID_CREDENTIALS");
    }
  });

  it("should not be able to login with inactive user", async () => {
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

    try {
      await AuthUserService({ email, password });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
      expect((err as AppError).message).toBe("ERR_USER_INACTIVE");
    }
  });

  it("should not be able to login outside working hours", async () => {
    const email = faker.internet.email();
    const password = strongPassword();

    // Janela de 0 minutos (início == fim) — impossível satisfazer no CI
    await CreateUserService({
      name: faker.person.fullName(),
      email,
      password,
      startWork: "23:59",
      endWork: "23:59"
    });

    try {
      await AuthUserService({ email, password });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
      expect((err as AppError).message).toBe("ERR_OUT_OF_HOURS");
    }
  });
});
