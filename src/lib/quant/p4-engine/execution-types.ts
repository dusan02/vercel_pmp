export type OrderStatus = 'CREATED' | 'RESERVED' | 'SUBMITTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface Reservation {
    reservationId: string;
    intentId: string;
    decisionId: string;
    ticker: string;
    action: 'BUY' | 'SELL';
    totalShares: number;
    filledShares: number;
    reservedPrice: number; // The exact price used for risk reservation (determines released cash)
    reservedFee: number;
    status: OrderStatus;
}

export type ExecutionEvent = 
    | { type: 'FILL', reservationId: string, fillId: string, shares: number, price: number, fee: number }
    | { type: 'PARTIAL_FILL', reservationId: string, fillId: string, shares: number, price: number, fee: number }
    | { type: 'CANCEL', reservationId: string }
    | { type: 'REJECT', reservationId: string, reason: string }
    | { type: 'EXPIRE', reservationId: string };
