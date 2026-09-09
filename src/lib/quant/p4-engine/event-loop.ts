import { BacktestOrchestrator } from './orchestrator-fsm';
import { CorporateAction } from './corporate-actions';
import { RiskLedgerState, MarketStatus } from './risk-types';

export type FSMPhase = 'START_OF_DAY' | 'CORPORATE_ACTIONS' | 'MARKET_OPEN' | 'SIGNAL_GENERATION' | 'ORDER_ROUTING' | 'MARKET_CLOSE' | 'SETTLEMENT' | 'END_OF_DAY';

export interface DataProvider {
    getPrices(date: string): Record<string, { val: number, status: MarketStatus }>;
    getCorporateActions(date: string): CorporateAction[];
}

export interface SignalGenerator {
    generateSignals(date: string, ledgerSnapshot: RiskLedgerState): any[];
}

export interface ExecutionRouter {
    routeAndExecute(date: string, orchestrator: BacktestOrchestrator): void;
}

export class BacktestEventLoop {
    private orchestrator: BacktestOrchestrator;
    private currentDate: string;
    private currentPhase: FSMPhase = 'START_OF_DAY';
    
    constructor(
        private dataProvider: DataProvider,
        private signalGenerator: SignalGenerator,
        private executionRouter: ExecutionRouter,
        initialCash: number,
        startDate: string
    ) {
        this.orchestrator = new BacktestOrchestrator(initialCash);
        this.currentDate = startDate;
    }

    public getOrchestrator(): BacktestOrchestrator {
        return this.orchestrator;
    }

    public advancePhase(phase: FSMPhase) {
        // Enforce temporal phase sequence
        const order: FSMPhase[] = ['START_OF_DAY', 'CORPORATE_ACTIONS', 'MARKET_OPEN', 'SIGNAL_GENERATION', 'ORDER_ROUTING', 'MARKET_CLOSE', 'SETTLEMENT', 'END_OF_DAY'];
        const currentIdx = order.indexOf(this.currentPhase);
        const nextIdx = order.indexOf(phase);
        
        if (nextIdx <= currentIdx && !(this.currentPhase === 'END_OF_DAY' && phase === 'START_OF_DAY')) {
            throw new Error(`Invalid phase transition from ${this.currentPhase} to ${phase}`);
        }
        
        this.currentPhase = phase;
    }

    public runDay(date: string) {
        this.currentDate = date;
        
        // 1. START OF DAY
        this.advancePhase('START_OF_DAY');

        // 2. CORPORATE ACTIONS (Apply splits and dividends BEFORE any signal generation)
        this.advancePhase('CORPORATE_ACTIONS');
        const actions = this.dataProvider.getCorporateActions(this.currentDate);
        for (const action of actions) {
            this.orchestrator.getLedger().applyCorporateAction(action);
        }

        // 3. MARKET OPEN (Update Pricing Snapshot)
        this.advancePhase('MARKET_OPEN');
        const prices = this.dataProvider.getPrices(this.currentDate);
        // Note: Prices should ideally be injected into the ledger snapshot here.
        // For architectural purity, the Ledger itself doesn't need to hold prices permanently,
        // but RiskEngine needs them to evaluate intents. We'll assume the snapshot builder provides them.

        // 4. SIGNAL GENERATION (P4.4 Signal Engine evaluates Strategy against updated data)
        this.advancePhase('SIGNAL_GENERATION');
        // const snapshot = buildSnapshot(this.orchestrator.getLedger(), prices);
        // const intents = this.signalGenerator.generateSignals(this.currentDate, snapshot);
        
        // 5. ORDER ROUTING (Intents passed to Orchestrator -> RiskEngine -> Ledger Reservation)
        this.advancePhase('ORDER_ROUTING');
        // for (const intent of intents) {
        //     this.orchestrator.processIntent(intent, snapshot);
        // }

        // 6. MARKET CLOSE
        this.advancePhase('MARKET_CLOSE');

        // 7. SETTLEMENT (Execution Router simulates fills and reports back to Orchestrator)
        this.advancePhase('SETTLEMENT');
        this.executionRouter.routeAndExecute(this.currentDate, this.orchestrator);

        // 8. END OF DAY
        this.advancePhase('END_OF_DAY');
    }
}
