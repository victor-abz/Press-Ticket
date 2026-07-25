import {
  InferAttributes,
  InferCreationAttributes,
  CreationOptional
} from "sequelize";
import {
  AutoIncrement,
  Column,
  CreatedAt,
  DataType,
  Model,
  PrimaryKey,
  Table,
  Unique,
  UpdatedAt
} from "sequelize-typescript";

@Table({ tableName: "WebhookEvents" })
class WebhookEvent extends Model<
  InferAttributes<WebhookEvent>,
  InferCreationAttributes<WebhookEvent>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  eventId: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "notificamehub"
  })
  source: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW
  })
  declare processedAt: CreationOptional<Date>;

  @CreatedAt
  declare createdAt: CreationOptional<Date>;

  @UpdatedAt
  declare updatedAt: CreationOptional<Date>;
}

export default WebhookEvent;
