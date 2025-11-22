// Blog Scheduler Runner - Standalone worker process
import { BlogScheduler } from '../src/lib/jobs/blogSchedulerCore';

console.log('🚀 Starting Blog Scheduler Runner...');

const scheduler = new BlogScheduler({
  enabled: true,
  scheduleTimes: ['06:00', '15:30'],
  saveToFile: true,
  aiEnhanced: false,
  // webhookUrl: 'https://your-cms.com/wp-json/wp/v2/posts'
});

// Start the scheduler
scheduler.start();

console.log('✅ Blog Scheduler Runner started successfully');
console.log('📝 Scheduler will run at 06:00 and 15:30 daily');

// Keep the process alive
process.on('SIGINT', () => {
  console.log('🛑 Stopping Blog Scheduler Runner...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Stopping Blog Scheduler Runner...');
  scheduler.stop();
  process.exit(0);
}); 