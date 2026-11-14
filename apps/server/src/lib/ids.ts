import { randomInt, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

/** byte criptograficamente seguro em [0, 256) */
export const randomByte = (): number => randomInt(0, 256);

/** índice em [0, max) — usado para escolher caracteres de um alfabeto */
export const randomIndex = (max: number): number => randomInt(0, max);

const PUBLIC_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

/** 6 chars sem confusão visual — vai na etiqueta QR (`quanto://i/<publicId>`) */
export function newPublicId(): string {
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += PUBLIC_ALPHABET[randomByte()! % PUBLIC_ALPHABET.length];
  }
  return id;
}
