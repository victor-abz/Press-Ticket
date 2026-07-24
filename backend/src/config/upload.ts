import path from "path";
import crypto from "crypto";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

const publicFolder = path.resolve(__dirname, "..", "..", "public");

// Tipos de mídia perigosos que nunca devem ser aceitos como anexo de
// mensagem/webhook — impede upload de HTML/SVG/scripts que seriam servidos
// pelo mesmo domínio da aplicação a partir de /public (risco de XSS).
const DANGEROUS_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-sh",
  "application/x-bat",
  "application/javascript",
  "text/javascript",
  "application/x-php",
  "application/php"
]);

const DANGEROUS_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".svg",
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".php",
  ".phtml",
  ".js",
  ".jsp",
  ".msi"
]);

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (DANGEROUS_MIME_TYPES.has(file.mimetype) || DANGEROUS_EXTENSIONS.has(ext)) {
    cb(new Error("Tipo de arquivo não permitido."));
    return;
  }

  cb(null, true);
};

export default {
  directory: publicFolder,

  storage: multer.diskStorage({
    destination: publicFolder,
    filename(req, file, cb) {
      // Nome gerado pelo sistema (nunca o nome original do usuário), com a
      // extensão original preservada apenas para compatibilidade de
      // exibição/conversão — previne path traversal e colisão de nomes.
      const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, "");
      const safeExt = ext.length > 0 && ext.length <= 10 ? ext : "";
      const fileName = `${Date.now()}_${crypto.randomUUID()}${safeExt}`;

      return cb(null, fileName);
    }
  }),

  fileFilter,

  limits: {
    fileSize: 500 * 1024 * 1024
  }
};
