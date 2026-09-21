'use client';

import { useState, useEffect } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { event } from '@/lib/ga';

/**
 * Compact per-ticker move alert toggle — "Track" step of the product loop.
 * Push-only (SymbolAlert has no email channel). Reuses the browser's existing
 * push subscription when present, so a user subscribed to the digest doesn't
 * get a second permission prompt.
 *
 * Renders nothing where push can't work (unsupported browsers, dev hosts).
 */
export function MoveAlertButton({ symbol }: { symbol: string }) {
    const [state, setState] = useState<'loading' | 'off' | 'on' | 'unsupported'>('loading');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const h = window.location.hostname;
        const isDevHost = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || isDevHost) {
            setState('unsupported');
            return;
        }
        let cancelled = false;
        navigator.serviceWorker.register('/sw.js').then(reg =>
            reg.pushManager.getSubscription().then(async sub => {
                if (cancelled) return;
                if (!sub) {
                    setState('off');
                    return;
                }
                try {
                    const res = await fetch(
                        `/api/notifications/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`
                    );
                    const data = res.ok ? await res.json() : null;
                    if (!cancelled) {
                        setState(
                            Array.isArray(data?.symbols) && data.symbols.includes(symbol.toUpperCase())
                                ? 'on'
                                : 'off'
                        );
                    }
                } catch {
                    if (!cancelled) setState('off');
                }
            })
        ).catch(() => { if (!cancelled) setState('off'); });
        return () => { cancelled = true; };
    }, [symbol]);

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const toggle = async () => {
        setBusy(true);
        try {
            const registration = await navigator.serviceWorker.ready;

            if (state === 'on') {
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await fetch(
                        `/api/notifications/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}&symbol=${encodeURIComponent(symbol)}`,
                        { method: 'DELETE' }
                    );
                }
                setState('off');
                event('unsubscribe_alert', { symbol: symbol.toUpperCase() });
                return;
            }

            const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!VAPID_PUBLIC_KEY) {
                alert('Push notifications are not configured on the server.');
                return;
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            const res = await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    symbol
                })
            });

            if (res.ok) {
                setState('on');
                event('subscribe_alert', { symbol: symbol.toUpperCase() });
            }
        } catch (error) {
            console.error('Move alert toggle failed:', error);
            if (state === 'off') alert('Push notification permission denied or failed.');
        } finally {
            setBusy(false);
        }
    };

    if (state === 'unsupported') return null;

    const on = state === 'on';

    return (
        <button
            onClick={toggle}
            disabled={busy || state === 'loading'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${on
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-800'
                }`}
            aria-label={on ? `Disable ${symbol} move alerts` : `Get ${symbol} move alerts`}
            title={on ? `${symbol} move alerts on` : `Alert me when ${symbol} makes an unusual move`}
        >
            {on ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            <span className="hidden sm:inline">{on ? 'Alerts On' : 'Move Alerts'}</span>
        </button>
    );
}
