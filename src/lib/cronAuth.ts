import { NextRequest } from 'next/server';

// Jednoduchá cron autorizácia
export async function getCronAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.warn('⚠️ CRON_SECRET environment variable not set');
    return { success: false };
  }
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return { success: false };
  }
  
  return { success: true };
}
