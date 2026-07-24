import { faker } from "@faker-js/faker";

export const strongPassword = (): string =>
  `Senha@${faker.string.alphanumeric(6)}1`;
