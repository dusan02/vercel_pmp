import { Instant } from './temporal-types.js';
import { PortfolioState, TargetPosition } from './portfolio-types.js';
import { ExecutionRecord } from './execution-types.js';

export type FSMPhase = 
    | "START_OF_DAY" 
    | "EXECUTION_WINDOW" 
    | "OBSERVATION_CUTOFF" 
    | "SIGNAL_GENERATION" 
    | "PORTFOLIO_CONSTRUCTION" 
    | "ORDER_ROUTING" 
    | "EOD_NAV_CALCULATION";

export interface SimulationContext {
    readonly clockTime: Instant;
    readonly currentPhase: FSMPhase;
    readonly portfolio: PortfolioState;
    readonly pendingOrders: TargetPosition[];
    readonly executionLog: ExecutionRecord[];
    readonly navHistory: Record<string, number>; // Date -> NAV
}

export interface CorporateAction {
    readonly cik: string;
    readonly exDate: string; // YYYY-MM-DD
    readonly type: "SPLIT" | "DIVIDEND" | "DELISTING";
    readonly splitFactor?: number; // e.g. 4 for 4:1 split
    readonly dividendAmount?: number; // per share
}
