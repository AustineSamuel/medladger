import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthenticatedRequest, UserRole } from './types.js';

type AccessClaims = { sub: string; role: UserRole; type: 'access' };

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const claims = jwt.verify(authorization.slice(7), config.ACCESS_TOKEN_SECRET) as AccessClaims;
    if (claims.type !== 'access' || !claims.sub || !claims.role) {
      return res.status(401).json({ error: 'Invalid access token.' });
    }
    req.user = { id: claims.sub, role: claims.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'This action is not permitted for this account.' });
    }
    return next();
  };
}
