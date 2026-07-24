import bcrypt from "bcryptjs";
import crypto from "crypto";
import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const password = crypto.randomBytes(12).toString("base64");
    const passwordHash = await bcrypt.hash(password, 10);

    console.log("\n=================================================");

    console.log("  Usuário admin criado com senha temporária:");

    console.log(`  Email: admin@pressticket.com.br`);

    console.log(`  Senha: ${password}`);

    console.log("  ALTERE ESTA SENHA IMEDIATAMENTE APÓS O LOGIN!");

    console.log("=================================================\n");

    return queryInterface.bulkInsert(
      "Users",
      [
        {
          name: "Press-Ticket",
          email: "admin@pressticket.com.br",
          passwordHash,
          profile: "admin",
          tokenVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      {}
    );
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.bulkDelete("Users", {});
  }
};
