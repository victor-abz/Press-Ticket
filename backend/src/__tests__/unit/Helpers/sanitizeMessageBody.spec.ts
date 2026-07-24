import { sanitizeMessageBody } from "../../../helpers/sanitizeMessageBody";

describe("sanitizeMessageBody", () => {
  it("should percent-encode quotes inside a bare http URL to prevent attribute breakout", () => {
    const malicious = 'http://evil.com"onmouseover="alert(1)"';
    expect(sanitizeMessageBody(malicious)).toBe(
      "http://evil.com%22onmouseover=%22alert(1)%22"
    );
  });

  it("should percent-encode quotes inside a bare www URL", () => {
    const malicious = 'www.evil.com"onmouseover="alert(1)';
    expect(sanitizeMessageBody(malicious)).toBe(
      "www.evil.com%22onmouseover=%22alert(1)"
    );
  });

  it("should leave legitimate URLs untouched", () => {
    const legit = "visite https://pressticket.com.br para saber mais";
    expect(sanitizeMessageBody(legit)).toBe(legit);
  });

  it("should leave URLs with legitimate query strings untouched", () => {
    const legit = "https://www.google.com/search?q=teste&x=1";
    expect(sanitizeMessageBody(legit)).toBe(legit);
  });

  it("should not touch quotes outside of URL-like substrings", () => {
    const text = 'ele disse "olá" para o cliente';
    expect(sanitizeMessageBody(text)).toBe(text);
  });

  it("should handle empty and falsy input", () => {
    expect(sanitizeMessageBody("")).toBe("");
  });
});
