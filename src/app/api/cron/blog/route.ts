import { BlogScheduler } from '@/lib/jobs/blogSchedulerCore';

export const dynamic = 'force-dynamic';               // → edge/serverless

export async function GET() {
  try {
    const scheduler = new BlogScheduler({
      enabled: true,
      scheduleTimes: [],       // ← dôležité: žiadne setTimeouty
      saveToFile: true,
      aiEnhanced: false,
      // webhookUrl: 'https://your-cms.com/wp-json/wp/v2/posts'
    });

    await scheduler.triggerNow();                     // ⚡ spustí a hneď skončí
    return new Response('Blog report created', { status: 200 });
  } catch (err) {
    console.error('cron/blog error:', err);
    return new Response('Blog report failed', { status: 500 });
  }
} 