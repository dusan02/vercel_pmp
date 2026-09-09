import { FSMPhase, SimulationContext, CorporateAction } from './backtest-types.js';
import { PortfolioState, TargetPosition, PortfolioPosition } from './portfolio-types.js';
import { InstantValidator } from './instant-validator.js';

export class BacktestOrchestrator {
    private state: SimulationContext;

    constructor(initialCash: number, startDate: string) {
        this.state = {
            clockTime: `${startDate}T00:00:00.000Z`,
            currentPhase: "START_OF_DAY",
            portfolio: { cash: initialCash, positions: [], observationTime: `${startDate}T00:00:00.000Z` },
            pendingOrders: [],
            executionLog: [],
            navHistory: {}
        };
    }

    public getState(): Readonly<SimulationContext> {
        // Deep clone for brutal reconstruction test dump to prevent reference mutation
        return JSON.parse(JSON.stringify(this.state));
    }

    public setTimeAndPhase(time: string, phase: FSMPhase) {
        InstantValidator.assertCanonical(time);
        
        // P4.8 Time Invariant: Time can only move forward
        if (time < this.state.clockTime) {
            throw new Error(`FATAL: Time-travel violation. Attempted to move from ${this.state.clockTime} to ${time}`);
        }
        
        this.state = {
            ...this.state,
            clockTime: time,
            currentPhase: phase
        };
    }

    public applyCorporateActions(actions: CorporateAction[], currentDate: string) {
        let newCash = this.state.portfolio.cash;
        let newPositions: PortfolioPosition[] = [];

        for (const pos of this.state.portfolio.positions) {
            const action = actions.find(a => a.cik === pos.cik && a.exDate === currentDate);
            
            if (action) {
                if (action.type === "SPLIT" && action.splitFactor) {
                    newPositions.push({ ...pos, shares: pos.shares * action.splitFactor });
                } else if (action.type === "DIVIDEND" && action.dividendAmount) {
                    newCash += pos.shares * action.dividendAmount;
                    newPositions.push(pos);
                } else if (action.type === "DELISTING") {
                    // Position written off to 0, removed from portfolio
                }
            } else {
                newPositions.push(pos);
            }
        }

        this.updatePortfolio({ cash: newCash, positions: newPositions, observationTime: this.state.clockTime });
    }

    public updatePortfolio(newPortfolio: PortfolioState) {
        this.state = { ...this.state, portfolio: newPortfolio };
    }

    public setPendingOrders(orders: TargetPosition[]) {
        this.state = { ...this.state, pendingOrders: orders };
    }

    public recordNav(date: string, nav: number) {
        this.state.navHistory[date] = nav;
    }
}
