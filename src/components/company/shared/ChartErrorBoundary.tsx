'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** Optional custom fallback height */
    minHeight?: string;
}

interface State {
    hasError: boolean;
}

/**
 * Local Error Boundary for individual charts.
 * Prevents a single chart crash from taking down the whole analysis tab.
 */
export class ChartErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, _info: ErrorInfo) {
        console.error('[ChartErrorBoundary]', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="flex items-center justify-center text-sm text-gray-400 dark:text-gray-500"
                    style={{ minHeight: this.props.minHeight ?? '12rem' }}
                >
                    Chart temporarily unavailable.
                </div>
            );
        }
        return this.props.children;
    }
}
