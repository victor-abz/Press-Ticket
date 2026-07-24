import AppError from "../../../errors/AppError";
import {
  assertPasswordValid,
  validatePassword
} from "../../../helpers/validatePassword";

describe("validatePassword", () => {
  it("aceita senha com todos os requisitos", () => {
    const result = validatePassword("Senha@123");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("aceita senha com caractere especial variado", () => {
    const result = validatePassword("Abc!defg1");
    expect(result.valid).toBe(true);
  });

  it("rejeita senha vazia", () => {
    const result = validatePassword("");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ERR_PASSWORD_REQUIRED");
  });

  it("rejeita senha com menos de 8 caracteres", () => {
    const result = validatePassword("Ab1@567");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ERR_PASSWORD_MIN_LENGTH");
  });

  it("rejeita senha sem maiúscula", () => {
    const result = validatePassword("senha@123");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ERR_PASSWORD_UPPERCASE");
  });

  it("rejeita senha sem minúscula", () => {
    const result = validatePassword("SENHA@123");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ERR_PASSWORD_LOWERCASE");
  });

  it("rejeita senha sem número", () => {
    const result = validatePassword("Senha@abc");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ERR_PASSWORD_NUMBER");
  });

  it("rejeita senha sem caractere especial", () => {
    const result = validatePassword("Senha1234");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ERR_PASSWORD_SPECIAL");
  });

  it("retorna múltiplos erros quando vários requisitos falham", () => {
    const result = validatePassword("abc");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it("assertPasswordValid não lança erro para senha válida", () => {
    expect(() => assertPasswordValid("Senha@123")).not.toThrow();
  });

  it("assertPasswordValid lança AppError para senha inválida", () => {
    expect(() => assertPasswordValid("fraca")).toThrow(AppError);
  });

  it("aceita senha com exatamente 8 caracteres válidos", () => {
    const result = validatePassword("Abc@123x");
    expect(result.valid).toBe(true);
  });

  it("retorna ERR_PASSWORD_MIN_LENGTH como primeiro erro quando senha é curta e sem maiúscula", () => {
    const { errors } = validatePassword("abc@1");
    expect(errors[0]).toBe("ERR_PASSWORD_MIN_LENGTH");
  });
});
