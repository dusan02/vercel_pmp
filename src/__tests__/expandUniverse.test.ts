/**
 * @jest-environment node
 *
 * Universe expansion parsing — NASDAQ Trader symbol directories.
 * Filters: ETF=Y out, TestIssue=Y out, warrants/units/rights/notes/preferred out.
 */
import {
    normalizeSymbol,
    parseNasdaqListed,
    parseOtherListed,
} from '../../scripts/expand-universe';

const NASDAQ_TXT = `Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
AACG|ATA Creativity Global - American Depositary Shares, each representing two common shares|S|N|N|100|N|N
AACIU|Armada Acquisition Corp. III - Units|G|N|N|100|N|N
AAAP|Pacer Barings CLO Market Flex ETF|G|N|N|100|Y|N
TEST|NASDAQ Test Sym|G|Y|N|100|N|N
BRK/B|Berkshire Hathaway Inc. Class B|G|N|N|100|N|N
PFW|PREF Notes 7.5% Debenture|G|N|N|100|N|N
File Creation Time: 0918202612:00|||||||
`;

const OTHER_TXT = `ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
A|Agilent Technologies, Inc. Common Stock|N|A|N|100|N|A
AAA|Alternative Access First Priority CLO Bond ETF|Z|AAA|Y|100|N|AAAA
WTIU|W&T Offshore Units|N|WTIU|N|100|N|WTIU
BF/B|Brown-Forman Corporation Class B|N|BF/B|N|100|N|BF.B
File Creation Time: 0918202612:00|||||||
`;

describe('normalizeSymbol', () => {
    it('maps NASDAQ / separator to Polygon . separator', () => {
        expect(normalizeSymbol('BRK/B')).toBe('BRK.B');
        expect(normalizeSymbol('bf/b ')).toBe('BF.B');
        expect(normalizeSymbol('AAPL')).toBe('AAPL');
    });
});

describe('parseNasdaqListed', () => {
    const rows = parseNasdaqListed(NASDAQ_TXT);
    const syms = rows.map(r => r.symbol);

    it('keeps common stocks and ADRs', () => {
        expect(syms).toContain('AACG');
        expect(syms).toContain('BRK.B');
    });

    it('drops ETFs, test issues, units, notes/preferred', () => {
        expect(syms).not.toContain('AAAP'); // ETF=Y
        expect(syms).not.toContain('TEST'); // TestIssue=Y
        expect(syms).not.toContain('AACIU'); // Units in name
        expect(syms).not.toContain('PFW'); // Notes/Debenture
    });

    it('skips the trailer line', () => {
        expect(rows.every(r => !r.symbol.startsWith('File'))).toBe(true);
    });
});

describe('parseOtherListed', () => {
    const rows = parseOtherListed(OTHER_TXT);
    const syms = rows.map(r => r.symbol);

    it('keeps NYSE common stocks with normalized symbols', () => {
        expect(syms).toContain('A');
        expect(syms).toContain('BF.B');
    });

    it('drops ETFs and units', () => {
        expect(syms).not.toContain('AAA');
        expect(syms).not.toContain('WTIU');
    });
});
