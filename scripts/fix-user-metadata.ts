import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const data = `
MRVL | Technology | Semiconductors
COIN | Financial Services | Software—Infrastructure
TER | Technology | Semiconductors
SE | Consumer Cyclical | Internet Retail
ITUB | Financials | Banks—Regional
NET | Technology | Software—Infrastructure
NEM | Basic Materials | Gold
NRG | Utilities | Utilities—Independent Power Producers
ING | Financials | Banks—Regional
PANW | Technology | Software—Infrastructure
AMX | Communication Services | Telecom Services
LYG | Financials | Banks—Regional
FTNT | Technology | Software—Infrastructure
HAL | Energy | Oil & Gas Equipment & Services
PLD | Real Estate | REIT—Industrial
SBUX | Consumer Cyclical | Restaurants
SMFG | Financials | Banks—Regional
MRNA | Healthcare | Biotechnology
BLK | Financial Services | Asset Management
FDX | Industrials | Integrated Freight & Logistics
SNPS | Technology | Software—Infrastructure
CSX | Industrials | Railroads
UPS | Industrials | Integrated Freight & Logistics
DD | Basic Materials | Specialty Chemicals
UPST | Financial Services | Credit Services
SWKS | Technology | Semiconductors
ZS | Technology | Software—Infrastructure
CDNS | Technology | Software—Infrastructure
HDB | Financials | Banks—Regional
DDOG | Technology | Software—Application
EQIX | Real Estate | REIT—Specialty
RMD | Healthcare | Medical Instruments & Supplies
MFC | Financials | Insurance—Life
PSA | Real Estate | REIT—Specialty
XPO | Industrials | Integrated Freight & Logistics
SHW | Basic Materials | Specialty Chemicals
WELL | Real Estate | REIT—Healthcare Facilities
NTES | Communication Services | Electronic Gaming & Multimedia
BUD | Consumer Defensive | Beverages—Brewers
SPGI | Financial Services | Financial Data & Stock Exchanges
TFX | Healthcare | Medical Instruments & Supplies
MMM | Industrials | Conglomerates
BDX | Healthcare | Medical Instruments & Supplies
AFL | Financial Services | Insurance—Life
NOC | Industrials | Aerospace & Defense
CCI | Real Estate | REIT—Specialty
UNP | Industrials | Railroads
GD | Industrials | Aerospace & Defense
HON | Industrials | Conglomerates
BN | Financial Services | Asset Management
ECL | Basic Materials | Specialty Chemicals
COO | Healthcare | Medical Instruments & Supplies
LMT | Industrials | Aerospace & Defense
DXCM | Healthcare | Medical Devices
EXR | Real Estate | REIT—Specialty
FER | Industrials | Engineering & Construction
AMT | Real Estate | REIT—Specialty
MCO | Financial Services | Financial Data & Stock Exchanges
JBHT | Industrials | Integrated Freight & Logistics
ETR | Utilities | Utilities—Regulated Electric
VTR | Real Estate | REIT—Healthcare Facilities
IDXX | Healthcare | Diagnostics & Research
LNC | Financial Services | Insurance—Life
EQR | Real Estate | REIT—Residential
O | Real Estate | REIT—Retail
E | Energy | Oil & Gas Integrated
HOLX | Healthcare | Medical Instruments & Supplies
AJG | Financial Services | Insurance Brokers
FNV | Basic Materials | Gold
SRE | Utilities | Utilities—Regulated Electric
ACN | Technology | Information Technology Services
STE | Healthcare | Medical Instruments & Supplies
ALL | Financial Services | Insurance—Property & Casualty
PPG | Basic Materials | Specialty Chemicals
MOS | Basic Materials | Agricultural Inputs
BKR | Energy | Oil & Gas Equipment & Services
EW | Healthcare | Medical Devices
UNM | Financial Services | Insurance—Life
ICE | Financial Services | Financial Data & Stock Exchanges
CHRW | Industrials | Integrated Freight & Logistics
XEL | Utilities | Utilities—Regulated Electric
D | Utilities | Utilities—Regulated Electric
CB | Financial Services | Insurance—Property & Casualty
AVB | Real Estate | REIT—Residential
CMCSA | Communication Services | Entertainment
AON | Financial Services | Insurance Brokers
PEG | Utilities | Utilities—Regulated Electric
WST | Healthcare | Medical Instruments & Supplies
BXP | Real Estate | REIT—Office
FE | Utilities | Utilities—Regulated Electric
CHTR | Communication Services | Entertainment
NUE | Basic Materials | Steel
WEC | Utilities | Utilities—Regulated Electric
AEE | Utilities | Utilities—Regulated Electric
SO | Utilities | Utilities—Regulated Electric
SNOW | Technology | Software—Application
PPL | Utilities | Utilities—Regulated Electric
SYF | Financial Services | Credit Services
ED | Utilities | Utilities—Regulated Electric
CME | Financial Services | Financial Data & Stock Exchanges
DUK | Utilities | Utilities—Regulated Electric
DTE | Utilities | Utilities—Regulated Electric
MPC | Energy | Oil & Gas Refining & Marketing
ESS | Real Estate | REIT—Residential
CMS | Utilities | Utilities—Regulated Electric
TRP | Energy | Oil & Gas Midstream
AWK | Utilities | Utilities—Regulated Water
SU | Energy | Oil & Gas Integrated
SLG | Real Estate | REIT—Office
HIG | Financial Services | Insurance—Property & Casualty
CINF | Financial Services | Insurance—Property & Casualty
VNO | Real Estate | REIT—Office
PBR | Energy | Oil & Gas Integrated
EIX | Utilities | Utilities—Regulated Electric
CTSH | Technology | Information Technology Services
WRB | Financial Services | Insurance—Property & Casualty
DOW | Basic Materials | Chemicals
ILMN | Healthcare | Diagnostics & Research
CNQ | Energy | Oil & Gas Exploration & Production
OKTA | Technology | Software—Infrastructure
SQ | Technology | Software—Infrastructure
DOCU | Technology | Software—Application
FICO | Technology | Software—Application
OXY | Energy | Oil & Gas Exploration & Production
FMC | Basic Materials | Agricultural Inputs
`.trim();

async function main() {
    const lines = data.split('\n').filter(l => l.trim().length > 0);
    
    let success = 0;
    let failed = 0;

    for (const line of lines) {
        // e.g. "COIN | Financial Services | Software—Infrastructure (Crypto Exchange)"
        let [symbol, sector, industry] = line.split('|').map(x => x.trim());
        
        // Remove clarifications from industry like "(Crypto Exchange)" and "(Fintech)" and "(Communication Towers)" and "(Data Centers)"
        industry = industry.replace(/\s*\(.*\)\s*/g, '');
        
        // Ensure standard sectors (User provided "Financials" and "Financial Services", "Financials" is usually "Financial Services")
        if (sector === 'Financials') sector = 'Financial Services';

        try {
            await prisma.ticker.update({
                where: { symbol },
                data: {
                    sector,
                    industry
                }
            });
            console.log(`✅ Updated ${symbol}: ${sector} / ${industry}`);
            success++;
        } catch (err: any) {
            console.error(`❌ Failed to update ${symbol}: ${err.message}`);
            failed++;
        }
    }
    console.log(`Done! Success: ${success}, Failed: ${failed}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
