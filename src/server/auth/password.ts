import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to argon2id.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the username is unknown, so response time does not reveal which usernames exist.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('coinio-dummy-password');
  await verifyPassword(await dummyHash, password);
}
