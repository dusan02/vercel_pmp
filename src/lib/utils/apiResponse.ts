import { NextResponse } from 'next/server';

type ApiResponseOptions = {
    status?: number;
    headers?: HeadersInit;
};

export function apiSuccess<T>(data: T, meta: Record<string, any> = {}, options: ApiResponseOptions = {}) {
    const { status = 200, headers } = options;
    return NextResponse.json(
        {
            success: true,
            data,
            ...meta,
            timestamp: new Date().toISOString(),
        },
        { status, ...(headers ? { headers } : {}) }
    );
}

export function apiError(message: string, status: number = 500, details?: any) {
    return NextResponse.json(
        {
            success: false,
            error: message,
            details,
            timestamp: new Date().toISOString(),
        },
        { status }
    );
}
