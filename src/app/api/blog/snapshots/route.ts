import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const snapshots = await prisma.dailyBlogSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      select: { date: true, overviewJson: true },
    });
    return NextResponse.json({ snapshots });
  } catch {
    return NextResponse.json({ snapshots: [] });
  }
}
