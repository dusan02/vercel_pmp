import { NextRequest } from 'next/server';
import { dbHelpers } from '../db/database';

export interface User {
  id: string;
  email: string;
  name: string;
}

export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  try {
    // For now, return a default user since we don't have full auth implemented
    // This allows the favorites API to work without breaking
    return {
      id: 'default',
      email: 'default@example.com',
      name: 'Default User'
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export function validateToken(token: string): User | null {
  try {
    // Simple token validation - in production you'd use JWT
    if (token === 'default-token') {
      return {
        id: 'default',
        email: 'default@example.com',
        name: 'Default User'
      };
    }
    return null;
  } catch (error) {
    console.error('Error validating token:', error);
    return null;
  }
} 