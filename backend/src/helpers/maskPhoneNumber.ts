const maskPhoneNumber = (number: string | null | undefined): string => {
  if (!number) return "";
  const str = String(number);
  if (str.length <= 4) return "****";
  return str.slice(0, -4) + "****";
};

export default maskPhoneNumber;
