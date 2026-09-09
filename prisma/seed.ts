import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Sample earnings calendar data for testing
  const sampleEarningsData = [
    {
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      date: new Date('2025-08-05'),
      time: 'after',
      epsEstimate: 1.25,
      epsActual: 1.30,
      revenueEstimate: 85000000000,
      revenueActual: 86000000000,
      marketCap: 3000000000000,
      percentChange: 2.5,
      marketCapDiff: 75000000000
    },
    {
      ticker: 'MSFT',
      companyName: 'Microsoft Corporation',
      date: new Date('2025-08-05'),
      time: 'after',
      epsEstimate: 2.85,
      epsActual: 2.90,
      revenueEstimate: 58000000000,
      revenueActual: 59000000000,
      marketCap: 2800000000000,
      percentChange: 1.8,
      marketCapDiff: 50000000000
    },
    {
      ticker: 'NVDA',
      companyName: 'NVIDIA Corporation',
      date: new Date('2025-08-05'),
      time: 'after',
      epsEstimate: 4.50,
      epsActual: 4.75,
      revenueEstimate: 24000000000,
      revenueActual: 25000000000,
      marketCap: 1200000000000,
      percentChange: 5.5,
      marketCapDiff: 65000000000
    },
  ]

  // Seed earnings calendar
  for (const data of sampleEarningsData) {
    try {
      await prisma.earningsCalendar.create({
        data: data
      })
    } catch (error) {
      // If record exists, update it
      await prisma.earningsCalendar.updateMany({
        where: {
          ticker: data.ticker,
          date: data.date
        },
        data: data
      })
    }
  }

  // Sample user preferences data
  const sampleUserPrefs = {
    userId: 'test-user-1',
    favorites: JSON.stringify(['AAPL', 'MSFT', 'NVDA']),
    theme: 'auto',
    defaultTab: 'all',
    autoRefresh: true,
    refreshInterval: 30,
    showEarnings: true,
    showNews: true,
    tableColumns: JSON.stringify(['symbol', 'price', 'change', 'changePercent', 'marketCap'])
  }

  await prisma.userPreferences.upsert({
    where: { userId: sampleUserPrefs.userId },
    update: sampleUserPrefs,
    create: sampleUserPrefs
  })

  console.log('✅ Database seeded successfully!')
  console.log(`📊 Created ${sampleEarningsData.length} earnings records`)
  console.log('👤 Created 1 user preferences record')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 