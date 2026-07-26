import maskPhoneNumber from "../../../helpers/maskPhoneNumber";

describe("maskPhoneNumber", () => {
  it("should mask the last 4 digits of a normal phone number", () => {
    expect(maskPhoneNumber("5521999991234")).toBe("552199999****");
  });

  it("should keep the '+' prefix and mask only the last 4 digits", () => {
    expect(maskPhoneNumber("+5521999991234")).toBe("+552199999****");
  });

  it("should return '****' for a number with exactly 4 characters", () => {
    expect(maskPhoneNumber("1234")).toBe("****");
  });

  it("should return '****' for a number with fewer than 4 characters", () => {
    expect(maskPhoneNumber("12")).toBe("****");
  });

  it("should return an empty string for null", () => {
    expect(maskPhoneNumber(null)).toBe("");
  });

  it("should return an empty string for undefined", () => {
    expect(maskPhoneNumber(undefined)).toBe("");
  });

  it("should return an empty string for an empty string", () => {
    expect(maskPhoneNumber("")).toBe("");
  });
});
