import { faker } from "@faker-js/faker";
import AppError from "../../../errors/AppError";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import DeleteUserService from "../../../services/UserServices/DeleteUserService";
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
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() }))
  }))
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

  it("should be delete a existing user", async () => {
    const { id } = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword()
    });

    expect(DeleteUserService(id)).resolves.not.toThrow();
  });

  it("to throw an error if tries to delete a non existing user", async () => {
    expect(DeleteUserService(faker.number.int())).rejects.toBeInstanceOf(
      AppError
    );
  });
});
