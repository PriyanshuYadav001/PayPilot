import crypto from 'node:crypto';

export function isValidCronSecret(providedSecret: string | undefined, expectedSecret = process.env.CRON_SECRET): boolean {
  if (!expectedSecret || !providedSecret) return false;
  const expected = Buffer.from(expectedSecret, 'utf8');
  const provided = Buffer.from(providedSecret, 'utf8');
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
