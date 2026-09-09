import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

const SITE_URL = 'https://premarketprice.com';
const SITE_TITLE = 'PreMarketPrice — Daily Market Report';
const SITE_DESCRIPTION = 'Daily pre-market and post-market analysis with AI-generated insights.';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET() {
  try {
    const snapshots = await prisma.dailyBlogSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      select: { date: true, overviewJson: true },
    });

    const items = snapshots
      .filter(snap => snap.overviewJson != null)
      .map(snap => {
        let overview: Record<string, unknown> | null = null;
        try {
          overview = JSON.parse(snap.overviewJson!) as Record<string, unknown>;
        } catch {
          // skip invalid JSON
        }
        const title = (overview?.title as string) || `Daily Market Report — ${snap.date}`;
        const summary = (overview?.summary as string) || (overview?.content as string) || '';
        const url = `${SITE_URL}/blog/${snap.date}`;
        const pubDate = new Date(snap.date + 'T09:00:00Z').toUTCString();

        return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${url}</link>
      <description>${escapeXml(summary.slice(0, 300))}${summary.length > 300 ? '…' : ''}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${url}</guid>
      <category>Market Analysis</category>
    </item>`;
      })
      .join('\n');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}/blog</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/api/rss" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    return new NextResponse(rss, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new NextResponse('<?xml version="1.0"?><rss version="2.0"><channel><title>PreMarketPrice Blog</title><link>https://premarketprice.com/blog</link></channel></rss>', {
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  }
}
