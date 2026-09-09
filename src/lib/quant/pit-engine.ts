import { PrismaClient } from '@prisma/client';

export interface UniverseAudit {
  securityId: string;
  lifecycleEligible: boolean;
  dataAvailable: boolean;
  strategyDataSufficient: boolean;
  exclusionReason: string | null;
}

export class PITEngine {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async getAuditedUniverse(timestamp: Date, allSecurities: string[]): Promise<UniverseAudit[]> {
    const auditTrail: UniverseAudit[] = [];
    
    for (const secId of allSecurities) {
      const security = await this.prisma.ewSecurity.findUnique({ where: { id: secId } });
      if (!security) {
        auditTrail.push({ securityId: secId, lifecycleEligible: false, dataAvailable: false, strategyDataSufficient: false, exclusionReason: 'UNKNOWN_SECURITY' });
        continue;
      }

      const lifecycleEligible = (!security.listDate || security.listDate.getTime() <= timestamp.getTime()) && 
                                (!security.delistedDate || security.delistedDate.getTime() > timestamp.getTime());
      
      if (!lifecycleEligible) {
        auditTrail.push({ securityId: secId, lifecycleEligible: false, dataAvailable: false, strategyDataSufficient: false, exclusionReason: 'LIFECYCLE_NOT_ACTIVE' });
        continue;
      }

      const obs = await this.prisma.ewFinancialObservation.findFirst({
        where: { securityId: secId, informationAvailableAt: { lte: timestamp } }
      });

      if (!obs) {
        auditTrail.push({ securityId: secId, lifecycleEligible: true, dataAvailable: false, strategyDataSufficient: false, exclusionReason: 'NO_FINANCIAL_DATA' });
        continue;
      }

      auditTrail.push({ securityId: secId, lifecycleEligible: true, dataAvailable: true, strategyDataSufficient: false, exclusionReason: 'PENDING_STRATEGY_CHECK' });
    }
    
    return auditTrail;
  }
}
