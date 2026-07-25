import { Request, Response } from "express";
import validateHubWebhookSecret from "../../../middleware/validateHubWebhookSecret";
import WebhookEvent from "../../../models/WebhookEvent";
import isNewWebhookEvent from "../../../services/WebhookServices/WebhookDeduplicationService";
import { disconnect, truncate } from "../../utils/database";

const SECRET = "test_hub_webhook_secret_value";

const buildRes = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const buildReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    params: { channelId: "channel-1" },
    query: { token: SECRET },
    body: {},
    ...overrides
  } as unknown as Request);

describe("validateHubWebhookSecret", () => {
  jest.setTimeout(30000);

  const originalSecret = process.env.HUB_WEBHOOK_SECRET;

  beforeEach(async () => {
    process.env.HUB_WEBHOOK_SECRET = SECRET;
    await truncate();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    process.env.HUB_WEBHOOK_SECRET = originalSecret;
    await disconnect();
  });

  it("should call next when secret is correct, no timestamp and no eventId", async () => {
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await validateHubWebhookSecret(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should reject with ERR_HUB_WEBHOOK_INVALID_TOKEN/401 when secret is incorrect", async () => {
    const req = buildReq({ query: { token: "wrong-token" } as unknown as Request["query"] });
    const res = buildRes();
    const next = jest.fn();

    await expect(
      validateHubWebhookSecret(req, res, next)
    ).rejects.toMatchObject({
      message: "ERR_HUB_WEBHOOK_INVALID_TOKEN",
      statusCode: 401
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject with ERR_HUB_WEBHOOK_INVALID_TOKEN/401 when token is missing", async () => {
    const req = buildReq({ query: {} as unknown as Request["query"] });
    const res = buildRes();
    const next = jest.fn();

    await expect(
      validateHubWebhookSecret(req, res, next)
    ).rejects.toMatchObject({
      message: "ERR_HUB_WEBHOOK_INVALID_TOKEN",
      statusCode: 401
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject with ERR_HUB_WEBHOOK_NOT_CONFIGURED/503 when HUB_WEBHOOK_SECRET env var is unset", async () => {
    delete process.env.HUB_WEBHOOK_SECRET;

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await expect(
      validateHubWebhookSecret(req, res, next)
    ).rejects.toMatchObject({
      message: "ERR_HUB_WEBHOOK_NOT_CONFIGURED",
      statusCode: 503
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next when timestamp is within the 5 minute window", async () => {
    const req = buildReq({
      headers: { "x-webhook-timestamp": String(Date.now() - 60_000) }
    });
    const res = buildRes();
    const next = jest.fn();

    await validateHubWebhookSecret(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should reject with ERR_HUB_WEBHOOK_TIMESTAMP_EXPIRED/400 when timestamp is older than 5 minutes", async () => {
    const req = buildReq({
      headers: {
        "x-webhook-timestamp": String(Date.now() - 6 * 60_000)
      }
    });
    const res = buildRes();
    const next = jest.fn();

    await expect(
      validateHubWebhookSecret(req, res, next)
    ).rejects.toMatchObject({
      message: "ERR_HUB_WEBHOOK_TIMESTAMP_EXPIRED",
      statusCode: 400
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject with ERR_HUB_WEBHOOK_TIMESTAMP_EXPIRED/400 when timestamp is NaN", async () => {
    const req = buildReq({
      headers: { "x-webhook-timestamp": "not-a-number" }
    });
    const res = buildRes();
    const next = jest.fn();

    await expect(
      validateHubWebhookSecret(req, res, next)
    ).rejects.toMatchObject({
      message: "ERR_HUB_WEBHOOK_TIMESTAMP_EXPIRED",
      statusCode: 400
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next when the x-webhook-timestamp header is absent", async () => {
    const req = buildReq({ headers: {} });
    const res = buildRes();
    const next = jest.fn();

    await validateHubWebhookSecret(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should call next when eventId is new", async () => {
    const req = buildReq({ body: { id: "event-new-1" } });
    const res = buildRes();
    const next = jest.fn();

    await validateHubWebhookSecret(req, res, next);

    expect(next).toHaveBeenCalled();

    const stored = await WebhookEvent.findOne({
      where: { eventId: "event-new-1" }
    });
    expect(stored).not.toBeNull();
  });

  it("should respond 200 { status: 'duplicate' } and not call next when eventId was already processed", async () => {
    await isNewWebhookEvent("event-dup-1", "notificamehub");

    const req = buildReq({ body: { id: "event-dup-1" } });
    const res = buildRes();
    const next = jest.fn();

    await validateHubWebhookSecret(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: "duplicate" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should detect duplicates using messageId (MESSAGE_STATUS payload shape)", async () => {
    await isNewWebhookEvent("status-dup-1", "notificamehub");

    const req = buildReq({ body: { messageId: "status-dup-1" } });
    const res = buildRes();
    const next = jest.fn();

    await validateHubWebhookSecret(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: "duplicate" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next when the payload has no id/messageId (no deduplication possible)", async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    const next = jest.fn();

    await validateHubWebhookSecret(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
