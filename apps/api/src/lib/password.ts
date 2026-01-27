import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(plaintext: string): string {
  return bcrypt.hashSync(plaintext, SALT_ROUNDS);
}

export function verifyPassword(plaintext: string, passwordHash: string): boolean {
  return bcrypt.compareSync(plaintext, passwordHash);
}

