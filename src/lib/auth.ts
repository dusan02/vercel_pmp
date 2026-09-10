import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbHelpers, runTransaction } from './database';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface User {
  id: string;
  email: string;
  name?: string | undefined;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  email: string;
  name?: string;
  expiresAt: string;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT token management
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

// Session management
export async function createSession(userId: string): Promise<Session> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();

  runTransaction(() => {
    dbHelpers.createSession.run(sessionId, userId, expiresAt);
  });

  const user = dbHelpers.getUserById.get(userId) as any;
  
  return {
    id: sessionId,
    userId,
    email: user.email,
    name: user.name,
    expiresAt
  };
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const session = dbHelpers.getSession.get(sessionId) as any;
  if (!session) return null;

  return {
    id: session.id,
    userId: session.user_id,
    email: session.email,
    name: session.name,
    expiresAt: session.expires_at
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  runTransaction(() => {
    dbHelpers.deleteSession.run(sessionId);
  });
}

// User management
export async function createUser(email: string, password: string, name?: string): Promise<User> {
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  runTransaction(() => {
    dbHelpers.createUser.run(userId, email, passwordHash, name);
  });

  return {
    id: userId,
    email,
    name,
    createdAt: new Date().toISOString()
  };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = dbHelpers.getUserByEmail.get(email) as any;
  if (!user) return null;

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at
  };
}

// Middleware for API routes
export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) return null;

  const session = await getSession(sessionId);
  if (!session) return null;

  return {
    id: session.userId,
    email: session.email,
    name: session.name,
    createdAt: new Date().toISOString() // We could fetch this from DB if needed
  };
}

// Cleanup expired sessions (run periodically)
export function cleanupExpiredSessions(): void {
  try {
    dbHelpers.cleanupExpiredSessions.run();
    console.log('🧹 Cleaned up expired sessions');
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
  }
} 