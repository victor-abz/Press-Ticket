import AppError from "../errors/AppError";

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

/**
 * Política de senha fixa no código (não configurável via Settings).
 * Regras: 8+ chars, 1 maiúscula, 1 minúscula, 1 número, 1 especial.
 * Regex sem lookahead — anti-ReDoS, alinhado ao padrão já usado no projeto.
 */
export const validatePassword = (password: string): ValidationResult => {
  const errors: string[] = [];

  if (!password || typeof password !== "string") {
    errors.push("ERR_PASSWORD_REQUIRED");
    return { valid: false, errors };
  }

  if (password.length < 8) {
    errors.push("ERR_PASSWORD_MIN_LENGTH");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("ERR_PASSWORD_UPPERCASE");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("ERR_PASSWORD_LOWERCASE");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("ERR_PASSWORD_NUMBER");
  }

  if (!SPECIAL_CHARS_REGEX.test(password)) {
    errors.push("ERR_PASSWORD_SPECIAL");
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Lança apenas o primeiro erro encontrado — não acumula (ver critérios da sessão).
 */
export const assertPasswordValid = (password: string): void => {
  const { valid, errors } = validatePassword(password);
  if (!valid) {
    throw new AppError(errors[0], 422);
  }
};
