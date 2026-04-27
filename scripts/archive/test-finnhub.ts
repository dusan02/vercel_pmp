import { AnalysisService } from '../src/services/analysisService';

async function main() {
    console.log("Syncing LLY...");
    await AnalysisService.syncFinancials('LLY');
    console.log("Done syncing LLY.");
}

main().catch(console.error);
