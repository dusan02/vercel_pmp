import { describe, it, expect } from '@jest/globals';
import { RiskEngine } from '../risk-engine';
import { RiskLedgerState, RiskIntent } from '../risk-types';

describe('P4.17 Minimal Viable Risk Engine (MVRE)', () => {

    const baseState: RiskLedgerState = {
        ledgerVersion: 1,
        cash: 100000,
        positions: {},
        prices: { 'AAPL': { val: 100, status: 'VALID' }, 'MSFT': { val: 200, status: 'VALID' } },
        pendingOrders: []
    };

    it('approves a safe BUY intent under G4 limits', () => {
        const intent: RiskIntent = { intentId: '1', ticker: 'AAPL', action: 'BUY', shares: 100, price: 100, fee: 5 };
        const res = RiskEngine.evaluateIntent(baseState, intent);
        expect(res.decision).toBe('APPROVE');
        expect(res.projectedWeight).toBeCloseTo(0.1, 4);
    });

    it('rejects a BUY intent that exceeds G4 limits (20%)', () => {
        const intent: RiskIntent = { intentId: '2', ticker: 'AAPL', action: 'BUY', shares: 250, price: 100, fee: 5 };
        const res = RiskEngine.evaluateIntent(baseState, intent);
        expect(res.decision).toBe('REJECT');
        expect(res.reason).toContain('G4_CONCENTRATION_VIOLATION');
    });

    it('rejects an intent that exceeds available cash', () => {
        const intent: RiskIntent = { intentId: '3', ticker: 'AAPL', action: 'BUY', shares: 1001, price: 100, fee: 5 };
        const res = RiskEngine.evaluateIntent(baseState, intent);
        expect(res.decision).toBe('REJECT');
        expect(res.reason).toContain('CASH_SUFFICIENCY_VIOLATION');
    });

    it('accumulates pending BUYs into G4 concentration check', () => {
        const state = {
            ...baseState,
            pendingOrders: [{ intentId: 'p1', ticker: 'AAPL', action: 'BUY', shares: 150, price: 100, fee: 5 }] as RiskIntent[]
        };
        const intent: RiskIntent = { intentId: '4', ticker: 'AAPL', action: 'BUY', shares: 60, price: 100, fee: 5 };
        const res = RiskEngine.evaluateIntent(state, intent);
        expect(res.decision).toBe('REJECT'); // 15% pending + 6% new = 21%
        expect(res.reason).toContain('G4_CONCENTRATION_VIOLATION');
    });

    it('does not reduce projected exposure from pending SELLs (Pessimistic Mode)', () => {
        const state: RiskLedgerState = {
            ...baseState,
            cash: 81000,
            positions: { 'AAPL': { shares: 190 } }, // 19% current
            pendingOrders: [{ intentId: 'p2', ticker: 'AAPL', action: 'SELL', shares: 100, price: 100, fee: 5 }] as RiskIntent[]
        };
        const intent: RiskIntent = { intentId: '5', ticker: 'AAPL', action: 'BUY', shares: 20, price: 100, fee: 5 };
        const res = RiskEngine.evaluateIntent(state, intent);
        expect(res.decision).toBe('REJECT'); // 19% + 2% = 21%, pending sell is ignored for headroom
        expect(res.reason).toContain('G4_CONCENTRATION_VIOLATION');
    });

    it('rejects DELISTED or UNVALUED assets', () => {
        const state = {
            ...baseState,
            prices: { 'MEME': { val: 0.01, status: 'DELISTED' as const } }
        };
        const intent: RiskIntent = { intentId: '7', ticker: 'MEME', action: 'BUY', shares: 1000, price: 0.01, fee: 5 };
        const res = RiskEngine.evaluateIntent(state, intent);
        expect(res.decision).toBe('REJECT');
        expect(res.reason).toContain('DATA_GATING_VIOLATION');
    });

    it('differentiates idempotency keys on ledger version change', () => {
        const intent: RiskIntent = { intentId: 'X', ticker: 'AAPL', action: 'BUY', shares: 10, price: 100, fee: 0 };
        const res1 = RiskEngine.evaluateIntent(baseState, intent);
        const res2 = RiskEngine.evaluateIntent({ ...baseState, ledgerVersion: 2 }, intent);
        expect(res1.decisionId).not.toBe(res2.decisionId);
    });

    it('rejects short selling', () => {
        const state = { ...baseState, positions: { 'AAPL': { shares: 10 } } };
        const intent: RiskIntent = { intentId: '6', ticker: 'AAPL', action: 'SELL', shares: 20, price: 100, fee: 0 };
        const res = RiskEngine.evaluateIntent(state, intent);
        expect(res.decision).toBe('REJECT');
        expect(res.reason).toContain('SHORT_ONLY_VIOLATION');
    });

});
