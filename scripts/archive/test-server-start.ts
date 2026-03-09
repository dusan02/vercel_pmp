/**
 * Test script to check server startup issues
 */

// Set environment variables
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

console.log('🔍 Testing server startup...');
console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`);
console.log(`POLYGON_API_KEY: ${process.env.POLYGON_API_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

// Test Prisma connection
async function testPrisma() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    console.log('\n📊 Testing Prisma connection...');
    const count = await prisma.ticker.count();
    console.log(`✅ Prisma connected: ${count} tickers found`);
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error('❌ Prisma error:', error);
    return false;
  }
}

// Test Redis connection
async function testRedis() {
  try {
    const { redisClient } = await import('./src/lib/redis');
    if (redisClient && redisClient.isOpen) {
      console.log('✅ Redis connected');
      return true;
    } else {
      console.log('⚠️ Redis not available (using in-memory cache)');
      return true; // Not critical
    }
  } catch (error) {
    console.log('⚠️ Redis error (non-critical):', error);
    return true; // Not critical
  }
}

// Test Next.js import
async function testNext() {
  try {
    console.log('\n📦 Testing Next.js import...');
    const next = await import('next');
    console.log('✅ Next.js imported successfully');
    return true;
  } catch (error) {
    console.error('❌ Next.js import error:', error);
    return false;
  }
}

async function testServerMain() {
  const results = {
    prisma: await testPrisma(),
    redis: await testRedis(),
    next: await testNext(),
  };
  
  console.log('\n📋 Test Results:');
  console.log(`  Prisma: ${results.prisma ? '✅' : '❌'}`);
  console.log(`  Redis: ${results.redis ? '✅' : '⚠️'}`);
  console.log(`  Next.js: ${results.next ? '✅' : '❌'}`);
  
  if (results.prisma && results.next) {
    console.log('\n✅ All critical tests passed - server should start');
  } else {
    console.log('\n❌ Some critical tests failed - check errors above');
    process.exit(1);
  }
}

testServerMain().catch(console.error);

