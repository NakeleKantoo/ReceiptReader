import { randomUUID } from 'expo-crypto';

/** IDs são gerados no cliente para que criar um registro nunca dependa da rede. */
export const newId = (): string => randomUUID();
