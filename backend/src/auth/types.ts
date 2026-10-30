import type { Request } from 'express';

export type UserRole = 'patient' | 'provider' | 'admin';
export type AuthUser = { id: string; role: UserRole };
export type AuthenticatedRequest = Request & { user?: AuthUser };
