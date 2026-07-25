import { faker } from "@faker-js/faker";
import WebhookEvent from "../../../models/WebhookEvent";
import isNewWebhookEvent from "../../../services/WebhookServices/WebhookDeduplicationService";
import { disconnect, truncate } from "../../utils/database";

describe("WebhookDeduplicationService", () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await truncate();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  it("should return true and persist the event on first submission", async () => {
    const eventId = faker.string.uuid();

    const result = await isNewWebhookEvent(eventId);

    expect(result).toBe(true);

    const persisted = await WebhookEvent.findOne({ where: { eventId } });
    expect(persisted).not.toBeNull();
    expect(persisted!.source).toBe("notificamehub");
  });

  it("should return false when the same eventId is submitted again", async () => {
    const eventId = faker.string.uuid();

    const first = await isNewWebhookEvent(eventId);
    const second = await isNewWebhookEvent(eventId);

    expect(first).toBe(true);
    expect(second).toBe(false);

    const count = await WebhookEvent.count({ where: { eventId } });
    expect(count).toBe(1);
  });

  it("should remove records older than the dedup window before checking", async () => {
    const eventId = faker.string.uuid();

    await WebhookEvent.create({
      eventId,
      source: "notificamehub",
      processedAt: new Date(Date.now() - 11 * 60 * 1000)
    });

    const result = await isNewWebhookEvent(eventId);

    expect(result).toBe(true);

    const records = await WebhookEvent.findAll({ where: { eventId } });
    expect(records).toHaveLength(1);
    expect(records[0].processedAt.getTime()).toBeGreaterThan(
      Date.now() - 60 * 1000
    );
  });

  it("should return true for a different eventId after cleanup removes the old one", async () => {
    const staleEventId = faker.string.uuid();
    const freshEventId = faker.string.uuid();

    await WebhookEvent.create({
      eventId: staleEventId,
      source: "notificamehub",
      processedAt: new Date(Date.now() - 11 * 60 * 1000)
    });

    const result = await isNewWebhookEvent(freshEventId);

    expect(result).toBe(true);
    await expect(
      WebhookEvent.findOne({ where: { eventId: staleEventId } })
    ).resolves.toBeNull();
  });

  it("should fail-open and return true when an unexpected database error occurs", async () => {
    const eventId = faker.string.uuid();

    jest
      .spyOn(WebhookEvent, "create")
      .mockRejectedValueOnce(new Error("connection lost"));

    const result = await isNewWebhookEvent(eventId);

    expect(result).toBe(true);
  });
});
