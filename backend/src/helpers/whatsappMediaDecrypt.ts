import crypto from "crypto";
import https from "https";

/**
 * Decriptação manual de mídia do WhatsApp (protocolo Signal/HKDF), usada como
 * fallback quando `Message.downloadMedia()` da whatsapp-web.js falha com o
 * erro opaco "r: r" (bug conhecido da lib, sem fix disponível).
 * Referência: https://github.com/sigalor/whatsapp-web-reveng
 */

export type MediaType =
  | "image"
  | "video"
  | "audio"
  | "ptt"
  | "document"
  | "sticker";

export const MEDIA_HKDF_INFO: Record<MediaType, string> = {
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  audio: "WhatsApp Audio Keys",
  ptt: "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
  sticker: "WhatsApp Image Keys"
};

const DEFAULT_MEDIA_HOST = "mmg.whatsapp.net";
const DEFAULT_TIMEOUT_MS = 15000;

export class MediaDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaDownloadError";
  }
}

export class MediaDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaDecryptionError";
  }
}

interface ExpandedMediaKey {
  iv: Buffer;
  cipherKey: Buffer;
  macKey: Buffer;
}

export function hkdfSync(
  ikm: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number
): Buffer {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  const hashLen = 32;
  const n = Math.ceil(length / hashLen);
  let t = Buffer.alloc(0);
  const okm: Buffer[] = [];

  for (let i = 1; i <= n; i += 1) {
    const hmac = crypto.createHmac("sha256", prk);
    hmac.update(Buffer.concat([t, info, Buffer.from([i])]));
    t = hmac.digest();
    okm.push(t);
  }

  return Buffer.concat(okm).subarray(0, length);
}

export function expandMediaKey(
  mediaKey: Buffer,
  infoString: string
): ExpandedMediaKey {
  const salt = Buffer.alloc(32, 0);
  const info = Buffer.from(infoString, "utf-8");
  const expanded = hkdfSync(mediaKey, salt, info, 112);

  return {
    iv: expanded.subarray(0, 16),
    cipherKey: expanded.subarray(16, 48),
    macKey: expanded.subarray(48, 80)
  };
}

const SAFE_PATH_CHARSET_REGEX = /^[A-Za-z0-9\-._~!$&'()*+,;=:%/]*$/;
const SAFE_QUERY_CHARSET_REGEX = /^[A-Za-z0-9\-._~!$&'()*+,;=:%/?]*$/;

export function isValidDirectPath(directPath: string): boolean {
  if (typeof directPath !== "string" || directPath.length === 0) {
    return false;
  }
  if (!directPath.startsWith("/") || directPath.startsWith("//")) {
    return false;
  }
  if (directPath.includes("@") || directPath.includes("\\")) {
    return false;
  }

  const questionMarkCount = (directPath.match(/\?/g) || []).length;
  if (questionMarkCount > 1) {
    return false;
  }

  const [pathPart, queryPart] = directPath.split("?");

  if (!SAFE_PATH_CHARSET_REGEX.test(pathPart)) {
    return false;
  }
  if (queryPart !== undefined && !SAFE_QUERY_CHARSET_REGEX.test(queryPart)) {
    return false;
  }

  return true;
}

export function fetchEncryptedMedia(
  directPath: string,
  host: string = DEFAULT_MEDIA_HOST,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!isValidDirectPath(directPath)) {
      reject(
        new MediaDownloadError(
          "directPath invalido: formato inesperado (possivel tentativa de SSRF)"
        )
      );
      return;
    }

    const url = `https://${host}${directPath}`;

    const request = https.get(url, { timeout: timeoutMs }, res => {
      if (
        res.statusCode === undefined ||
        res.statusCode < 200 ||
        res.statusCode >= 300
      ) {
        reject(
          new MediaDownloadError(
            `Falha ao baixar midia: HTTP ${res.statusCode}`
          )
        );
        res.resume();
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", err => reject(new MediaDownloadError(err.message)));
    });

    request.on("timeout", () => {
      request.destroy();
      reject(
        new MediaDownloadError(
          `Timeout de ${timeoutMs}ms ao baixar midia de ${host}`
        )
      );
    });

    request.on("error", err => reject(new MediaDownloadError(err.message)));
  });
}

export function validateMac(
  iv: Buffer,
  ciphertext: Buffer,
  mac: Buffer,
  macKey: Buffer
): boolean {
  const expectedMac = crypto
    .createHmac("sha256", macKey)
    .update(Buffer.concat([iv, ciphertext]))
    .digest()
    .subarray(0, 10);

  return crypto.timingSafeEqual(expectedMac, mac);
}

function decryptAesCbc(
  ciphertext: Buffer,
  cipherKey: Buffer,
  iv: Buffer
): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-cbc", cipherKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export interface DownloadAndDecryptMediaParams {
  directPath: string;
  mediaKey: string;
  type: MediaType;
  host?: string;
  timeoutMs?: number;
  /**
   * Nunca deve ser `true` em produção — existe apenas para testes.
   */
  skipMacValidation?: boolean;
}

export async function downloadAndDecryptMedia({
  directPath,
  mediaKey,
  type,
  host,
  timeoutMs,
  skipMacValidation = false
}: DownloadAndDecryptMediaParams): Promise<Buffer> {
  if (!directPath) {
    throw new MediaDecryptionError("directPath e obrigatorio");
  }
  if (!mediaKey) {
    throw new MediaDecryptionError("mediaKey e obrigatorio");
  }

  const infoString = MEDIA_HKDF_INFO[type];
  if (!infoString) {
    throw new MediaDecryptionError(
      `Tipo de midia nao suportado: "${type}". Use um de: ${Object.keys(MEDIA_HKDF_INFO).join(", ")}`
    );
  }

  const mediaKeyBuffer = Buffer.from(mediaKey, "base64");
  if (mediaKeyBuffer.length !== 32) {
    throw new MediaDecryptionError(
      `mediaKey invalida: esperado 32 bytes, recebido ${mediaKeyBuffer.length}`
    );
  }

  const { iv, cipherKey, macKey } = expandMediaKey(mediaKeyBuffer, infoString);
  const fullFile = await fetchEncryptedMedia(directPath, host, timeoutMs);

  if (fullFile.length <= 10) {
    throw new MediaDecryptionError(
      "Arquivo baixado muito pequeno para conter MAC + conteudo"
    );
  }

  const ciphertext = fullFile.subarray(0, fullFile.length - 10);
  const mac = fullFile.subarray(fullFile.length - 10);

  if (!skipMacValidation) {
    const macOk = validateMac(iv, ciphertext, mac, macKey);
    if (!macOk) {
      throw new MediaDecryptionError(
        "Validacao de MAC falhou - a midia pode estar corrompida, expirada, ou a mediaKey/directPath nao correspondem a esta mensagem"
      );
    }
  }

  return decryptAesCbc(ciphertext, cipherKey, iv);
}
