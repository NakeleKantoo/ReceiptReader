import type { UserRole } from '@quanto/core';

export type AuthContext = {
  sessionId: string;
  userId: string;
  householdId: string;
  name: string;
  role: UserRole;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
