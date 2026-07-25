import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("WebhookEvents", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      eventId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        comment: "ID único do evento de webhook. Violação de UNIQUE = duplicata."
      },
      source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "notificamehub"
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex("WebhookEvents", ["processedAt"], {
      name: "webhook_events_processed_at_idx"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("WebhookEvents");
  }
};
