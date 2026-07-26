import { faker } from "@faker-js/faker";
import AppError from "../../../errors/AppError";
import User from "../../../models/User";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import UpdateUserService from "../../../services/UserServices/UpdateUserService";
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

describe("User", () => {
  beforeEach(async () => {
    await truncate();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  it("should be able to find a user", async () => {
    const newUser = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword()
    });

    const updatedUser = await UpdateUserService({
      userId: newUser.id,
      userData: {
        name: "New name",
        email: "newmail@email.com"
      }
    });

    expect(updatedUser).toHaveProperty("name", "New name");
    expect(updatedUser).toHaveProperty("email", "newmail@email.com");
  });

  it("should not be able to updated a inexisting user", async () => {
    const userId = faker.number.int();
    const userData = {
      name: faker.person.fullName(),
      email: faker.internet.email()
    };

    expect(UpdateUserService({ userId, userData })).rejects.toBeInstanceOf(
      AppError
    );
  });

  it("should not be able to updated an user with invalid data", async () => {
    const newUser = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword()
    });

    const userId = newUser.id;
    const userData = {
      name: faker.person.fullName(),
      email: "test.worgn.email"
    };

    expect(UpdateUserService({ userId, userData })).rejects.toBeInstanceOf(
      AppError
    );
  });

  it("incrementa tokenVersion ao mudar profile de admin para user", async () => {
    const newUser = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword(),
      profile: "admin"
    });

    const userBefore = await User.findByPk(newUser.id, {
      attributes: ["tokenVersion"]
    });
    const tokenVersionBefore = userBefore?.tokenVersion as number;

    const updatedUser = await UpdateUserService({
      userId: newUser.id,
      userData: {
        profile: "user"
      }
    });

    const userAfter = await User.findByPk(newUser.id, {
      attributes: ["tokenVersion"]
    });

    expect(updatedUser).toHaveProperty("profile", "user");
    expect(userAfter?.tokenVersion).toBe(tokenVersionBefore + 1);
  });

  it("não incrementa tokenVersion ao atualizar outros campos sem mudar profile", async () => {
    const newUser = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword(),
      profile: "admin"
    });

    const userBefore = await User.findByPk(newUser.id, {
      attributes: ["tokenVersion"]
    });
    const tokenVersionBefore = userBefore?.tokenVersion as number;

    const updatedUser = await UpdateUserService({
      userId: newUser.id,
      userData: {
        name: "Novo Nome"
      }
    });

    const userAfter = await User.findByPk(newUser.id, {
      attributes: ["tokenVersion"]
    });

    expect(updatedUser).toHaveProperty("name", "Novo Nome");
    expect(userAfter?.tokenVersion).toBe(tokenVersionBefore);
  });

  it("não incrementa tokenVersion ao salvar o mesmo profile", async () => {
    const newUser = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword(),
      profile: "admin"
    });

    const userBefore = await User.findByPk(newUser.id, {
      attributes: ["tokenVersion"]
    });
    const tokenVersionBefore = userBefore?.tokenVersion as number;

    const updatedUser = await UpdateUserService({
      userId: newUser.id,
      userData: {
        profile: "admin"
      }
    });

    const userAfter = await User.findByPk(newUser.id, {
      attributes: ["tokenVersion"]
    });

    expect(updatedUser).toHaveProperty("profile", "admin");
    expect(userAfter?.tokenVersion).toBe(tokenVersionBefore);
  });
});
