/**
 * Escapes literal SQL LIKE wildcards (% and _) in user-supplied search input
 * before it is embedded in a `%${value}%` pattern, so a search term cannot
 * broaden the match beyond what the user typed (e.g. searching for "_" would
 * otherwise match any single character).
 */
export function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}
