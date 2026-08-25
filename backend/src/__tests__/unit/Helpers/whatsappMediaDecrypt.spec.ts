import crypto from "crypto";
import https from "https";

import {
  MEDIA_HKDF_INFO,
  MediaDecryptionError,
  MediaDownloadError,
  MediaType,
  downloadAndDecryptMedia,
  expandMediaKey,
  isValidDirectPath
} from "../../../helpers/whatsappMediaDecrypt";

jest.mock("https");

interface MockResponse {
  statusCode: number;
  chunks: Buffer[];
}

const mockHttpsGetOnce = ({ statusCode, chunks }: MockResponse): void => {
  (https.get as unknown as jest.Mock).mockImplementationOnce(
    (_url: string, _options: unknown, callback: (res: unknown) => void) => {
      const onHandler = (
        event: string,
        handler: (arg?: unknown) => void
      ): void => {
        if (event === "data" && statusCode >= 200 && statusCode < 300) {
          chunks.forEach(chunk => handler(chunk));
        }
        if (event === "end" && statusCode >= 200 && statusCode < 300) {
          handler();
        }
      };

      const res = {
        statusCode,
        resume: jest.fn(),
        on: jest.fn(onHandler)
      };

      callback(res);

      return {
        on: jest.fn(),
        destroy: jest.fn()
      };
    }
  );
};

const buildEncryptedPayload = (
  mediaKey: Buffer,
  type: MediaType,
  plaintext: Buffer
): Buffer => {
  const infoString = MEDIA_HKDF_INFO[type];
  const { iv, cipherKey, macKey } = expandMediaKey(mediaKey, infoString);

  const cipher = crypto.createCipheriv("aes-256-cbc", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const mac = crypto
    .createHmac("sha256", macKey)
    .update(Buffer.concat([iv, ciphertext]))
    .digest()
    .subarray(0, 10);

  return Buffer.concat([ciphertext, mac]);
};

describe("whatsappMediaDecrypt", () => {
  describe("downloadAndDecryptMedia", () => {
    it("should download and decrypt media matching the original plaintext (happy path)", async () => {
      const mediaKey = crypto.randomBytes(32);
      const plaintext = Buffer.from("conteudo de midia de teste do whatsapp");
      const fullFile = buildEncryptedPayload(mediaKey, "image", plaintext);

      mockHttpsGetOnce({ statusCode: 200, chunks: [fullFile] });

      const result = await downloadAndDecryptMedia({
        directPath: "/v/t62.7118-24/fake-direct-path",
        mediaKey: mediaKey.toString("base64"),
        type: "image"
      });

      expect(result.equals(plaintext)).toBe(true);
    });

    it("should reject with MediaDecryptionError when the MAC does not match", async () => {
      const encryptKey = crypto.randomBytes(32);
      const wrongKey = crypto.randomBytes(32);
      const plaintext = Buffer.from("conteudo qualquer");
      const fullFile = buildEncryptedPayload(encryptKey, "image", plaintext);

      mockHttpsGetOnce({ statusCode: 200, chunks: [fullFile] });

      await expect(
        downloadAndDecryptMedia({
          directPath: "/v/t62.7118-24/fake-direct-path",
          mediaKey: wrongKey.toString("base64"),
          type: "image"
        })
      ).rejects.toThrow(MediaDecryptionError);
    });

    it("should reject with MediaDecryptionError for an unsupported media type", async () => {
      const mediaKey = crypto.randomBytes(32);

      await expect(
        downloadAndDecryptMedia({
          directPath: "/v/t62.7118-24/fake-direct-path",
          mediaKey: mediaKey.toString("base64"),
          type: "gif" as MediaType
        })
      ).rejects.toThrow(MediaDecryptionError);

      expect(https.get).not.toHaveBeenCalled();
    });

    it("should reject before hitting the network when directPath is missing", async () => {
      await expect(
        downloadAndDecryptMedia({
          directPath: "",
          mediaKey: crypto.randomBytes(32).toString("base64"),
          type: "image"
        })
      ).rejects.toThrow(MediaDecryptionError);

      expect(https.get).not.toHaveBeenCalled();
    });

    it("should reject before hitting the network when mediaKey is missing", async () => {
      await expect(
        downloadAndDecryptMedia({
          directPath: "/v/t62.7118-24/fake-direct-path",
          mediaKey: "",
          type: "image"
        })
      ).rejects.toThrow(MediaDecryptionError);

      expect(https.get).not.toHaveBeenCalled();
    });

    it("should reject with MediaDownloadError on a non-2xx HTTP response (e.g. expired directPath)", async () => {
      mockHttpsGetOnce({ statusCode: 404, chunks: [] });

      await expect(
        downloadAndDecryptMedia({
          directPath: "/v/t62.7118-24/expired-direct-path",
          mediaKey: crypto.randomBytes(32).toString("base64"),
          type: "image"
        })
      ).rejects.toThrow(MediaDownloadError);
    });

    it("should reject with MediaDecryptionError when mediaKey does not decode to 32 bytes", async () => {
      const shortKey = crypto.randomBytes(16).toString("base64");

      await expect(
        downloadAndDecryptMedia({
          directPath: "/v/t62.7118-24/fake-direct-path",
          mediaKey: shortKey,
          type: "image"
        })
      ).rejects.toThrow(MediaDecryptionError);

      expect(https.get).not.toHaveBeenCalled();
    });
  });

  describe("isValidDirectPath", () => {
    it("should accept a real directPath with a signature query string", () => {
      const directPath =
        "/o1/v/t24/f2/m235/AQNkP0u9IqLvmcKtoRNpdOar4ORQY_dRTVV_qH_kLRoQKc8wRryudaGmn7qRverlC0TfIDPHv8IgUuZjFheo6hoo3IKZsnIS_x5Ho_f2Ew?ccb=9-4&oh=01_Q5Aa5QGp6a6mPGMF1YV2DNt0gLxSpzZa14UBAZpwveFEEHVezw&oe=6AB09230&_nc_sid=e6ed6c";

      expect(isValidDirectPath(directPath)).toBe(true);
    });

    it("should reject a directPath containing @ in the path (SSRF host confusion)", () => {
      expect(isValidDirectPath("/foo@evil.com/bar")).toBe(false);
    });

    it("should reject a directPath containing @ inside the query string", () => {
      expect(isValidDirectPath("/foo?x=@evil.com")).toBe(false);
    });

    it("should reject a directPath with more than one ?", () => {
      expect(isValidDirectPath("/foo?a=1?b=2")).toBe(false);
    });

    it("should reject a protocol-relative //host directPath", () => {
      expect(isValidDirectPath("//evil.com/foo")).toBe(false);
    });

    it("should accept a simple directPath without a query string", () => {
      expect(isValidDirectPath("/v/t62.7118-24/fake-direct-path")).toBe(true);
    });
  });
});
