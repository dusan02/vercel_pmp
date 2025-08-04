import { startEarningsMonitoring, shouldMonitorEarnings } from './earningsMonitor';

let monitoringInterval: NodeJS.Timeout | null = null;
let isMonitoringActive = false;

/**
 * Spustí automatické monitorovanie earnings
 */
export function startEarningsScheduler(project: string = 'pmp'): void {
  if (isMonitoringActive) {
    console.log('⚠️ Earnings scheduler is already active');
    return;
  }
  
  console.log('🚀 Starting earnings scheduler...');
  isMonitoringActive = true;
  
  // Spustí monitorovanie každú minútu
  monitoringInterval = setInterval(async () => {
    try {
      // Kontrola, či je čas na monitorovanie (00:00-06:00 EST)
      if (shouldMonitorEarnings()) {
        console.log('🕛 Running scheduled earnings check...');
        await startEarningsMonitoring(project);
      } else {
        console.log('⏰ Outside monitoring hours (00:00-06:00 EST)');
      }
    } catch (error) {
      console.error('❌ Error in scheduled earnings monitoring:', error);
    }
  }, 60 * 1000); // Každá minúta
  
  console.log('✅ Earnings scheduler started successfully');
}

/**
 * Zastaví automatické monitorovanie earnings
 */
export function stopEarningsScheduler(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    isMonitoringActive = false;
    console.log('🛑 Earnings scheduler stopped');
  }
}

/**
 * Kontrola, či je scheduler aktívny
 */
export function isEarningsSchedulerActive(): boolean {
  return isMonitoringActive;
}

/**
 * Manuálne spustenie monitorovania
 */
export async function manualEarningsCheck(project: string = 'pmp'): Promise<void> {
  console.log('🔍 Manual earnings check triggered');
  await startEarningsMonitoring(project);
}

/**
 * Inicializácia scheduleru pri štarte aplikácie
 */
export function initializeEarningsScheduler(project: string = 'pmp'): void {
  console.log('🔧 Initializing earnings scheduler...');
  
  // Spustí scheduler
  startEarningsScheduler(project);
  
  // Cleanup pri ukončení aplikácie
  process.on('SIGINT', () => {
    console.log('🛑 Shutting down earnings scheduler...');
    stopEarningsScheduler();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('🛑 Shutting down earnings scheduler...');
    stopEarningsScheduler();
    process.exit(0);
  });
} 