import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt with Node's defaults (N=16384, r=8, p=1): ~50 ms on a Pi 4, no
// native dependency. Stored as "scrypt$<salt hex>$<hash hex>".
const KEYLEN = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
}

/** Constant time; a malformed hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltHex, hashHex] = stored.split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await derive(password, Buffer.from(saltHex, 'hex'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A hash to compare against when the user does not exist, so timing doesn't tell. */
export const DUMMY_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(KEYLEN)}`;
