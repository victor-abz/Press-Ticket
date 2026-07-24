import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Users", "loginAttempts", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.addColumn("Users", "lockedUntil", {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn("Users", "lockCount", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment:
        "Número de vezes que a conta foi bloqueada — usado para progressão do lockout"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "lockCount");
    await queryInterface.removeColumn("Users", "lockedUntil");
    await queryInterface.removeColumn("Users", "loginAttempts");
  }
};
