import { faker } from "@faker-js/faker";
import AppError from "../../../errors/AppError";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import { disconnect, truncate } from "../../utils/database";
import { strongPassword } from "../../utils/strongPassword";

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

  it("should be able to create a new user", async () => {
    const user = await CreateUserService({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: strongPassword()
    });

    expect(user).toHaveProperty("id");
  });

  it("should not be able to create a user with duplicated email", async () => {
    await CreateUserService({
      name: faker.person.fullName(),
      email: "teste@sameemail.com",
      password: strongPassword()
    });

    try {
      await CreateUserService({
        name: faker.person.fullName(),
        email: "teste@sameemail.com",
        password: strongPassword()
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
    }
  });
});
