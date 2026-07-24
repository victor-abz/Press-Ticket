/**
 * The frontend renders message bodies through react-whatsmarked, which uses
 * `marked` with `sanitize: false` and a custom link renderer that interpolates
 * the raw autolink match straight into `href="..."` without escaping quotes.
 * A bare URL like `http://x"onmouseover="alert(1)` in an inbound message body
 * therefore breaks out of the href attribute and injects a live HTML attribute
 * (confirmed by rendering react-whatsmarked directly — see SEC-07 audit).
 *
 * Quote/angle-bracket characters are not valid unescaped in a URL anyway
 * (RFC 3986), so percent-encoding them here is a safe, non-lossy transform
 * that neutralizes the attribute breakout without corrupting legitimate URLs
 * shared by contacts.
 */
const URL_LIKE = /((?:https?:\/\/|www\.)\S+)/gi;
const DANGEROUS_URL_CHARS = /["'<>]/g;

const percentEncode: Record<string, string> = {
  '"': "%22",
  "'": "%27",
  "<": "%3C",
  ">": "%3E"
};

export const sanitizeMessageBody = (text: string): string => {
  if (!text) return text;

  return text.replace(URL_LIKE, match =>
    match.replace(DANGEROUS_URL_CHARS, char => percentEncode[char])
  );
};
