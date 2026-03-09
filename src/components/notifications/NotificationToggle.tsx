'use client';

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Mail, ShieldCheck } from 'lucide-react';

export function NotificationToggle() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [showEmailInput, setShowEmailInput] = useState(false);

    useEffect(() => {
        // Check current subscription status
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then(registration => {
                registration.pushManager.getSubscription().then(subscription => {
                    setIsSubscribed(!!subscription);
                });
            });
        }
    }, []);

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

    const subscribe = async () => {
        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;

            // Get VAPID public key from env (we'll fetch it from an API or just use the one we have if it's safe)
            // For now, let's assume we have it in a simple config or fetch it
            const VAPID_PUBLIC_KEY = 'BIXKIswNhBT8lXuqttbYh42w3-x2G02ZPMLSMYYwZL7CoNnYlvg-wbN5o0uMQN33azAJjZEmkAbkJDmpYNUKmVk8';

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            // Save to backend
            const res = await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    email: email || null
                })
            });

            if (res.ok) {
                setIsSubscribed(true);
                setShowEmailInput(false);
            }
        } catch (error) {
            console.error('Failed to subscribe:', error);
            alert('Push notification permission denied or failed.');
        } finally {
            setLoading(false);
        }
    };

    const unsubscribe = async () => {
        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                // Notify backend to delete the subscription
                await fetch(`/api/notifications/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
                    method: 'DELETE'
                });

                await subscription.unsubscribe();
                setIsSubscribed(false);
            }
        } catch (error) {
            console.error('Failed to unsubscribe:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    <div>
                        <div className="text-sm font-bold text-blue-900 dark:text-blue-100">Quality Alerts</div>
                        <div className="text-[10px] text-blue-600/80">Never miss a Safe Zone breakout.</div>
                    </div>
                </div>

                <button
                    onClick={() => isSubscribed ? unsubscribe() : setShowEmailInput(!showEmailInput)}
                    disabled={loading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${isSubscribed
                        ? 'bg-white text-blue-600 shadow-sm border border-blue-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                        }`}
                >
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : isSubscribed ? (
                        <>
                            <BellOff className="w-3 h-3" />
                            Unsubscribe
                        </>
                    ) : (
                        <>
                            <Bell className="w-3 h-3" />
                            Get Alerts
                        </>
                    )}
                </button>
            </div>

            {showEmailInput && !isSubscribed && (
                <div className="mt-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        <input
                            type="email"
                            placeholder="Email (optional)"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-lg pl-8 pr-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={subscribe}
                        className="w-full bg-blue-600 text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors"
                    >
                        Activate Multi-Channel Alerts
                    </button>
                </div>
            )}
        </div>
    );
}
