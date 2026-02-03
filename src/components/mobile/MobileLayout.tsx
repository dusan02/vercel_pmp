'use client';

import React, { ReactNode, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MobileTabBar, MobileTab } from './MobileTabBar';
import { MobileHeader } from './MobileHeader';

interface MobileLayoutProps {
    activeTab: MobileTab;
    onTabChange: (tab: MobileTab) => void;
    screens: Record<MobileTab, ReactNode>;
}

/**
 * MobileLayout v2 - Clean Slate Architecture
 * 
 * Replaces the complex absolute-positioned "screen" system with a 
 * semantic flexbox layout and smooth Framer Motion transitions.
 */
export function MobileLayout({ activeTab, onTabChange, screens }: MobileLayoutProps) {
    const [direction, setDirection] = useState(0);
    const prevTabRef = useRef<MobileTab>(activeTab);

    // Tab order for determining slide direction
    const tabOrder: MobileTab[] = ['heatmap', 'portfolio', 'favorites', 'earnings', 'allStocks'];

    useEffect(() => {
        const prevIndex = tabOrder.indexOf(prevTabRef.current);
        const currIndex = tabOrder.indexOf(activeTab);

        if (prevIndex !== -1 && currIndex !== -1) {
            setDirection(currIndex > prevIndex ? 1 : -1);
        }
        prevTabRef.current = activeTab;
    }, [activeTab]);

    // Handle --app-height for iOS Safari UI issues
    useEffect(() => {
        const setAppHeight = () => {
            const h = window.visualViewport?.height ?? window.innerHeight;
            document.documentElement.style.setProperty('--app-height', `${h}px`);
        };

        setAppHeight();
        window.visualViewport?.addEventListener('resize', setAppHeight);
        window.addEventListener('resize', setAppHeight);

        return () => {
            window.visualViewport?.removeEventListener('resize', setAppHeight);
            window.removeEventListener('resize', setAppHeight);
        };
    }, []);

    const variants: any = {
        enter: (direction: number) => ({
            x: direction > 0 ? '100vw' : '-100vw',
            opacity: 0,
            scale: 0.98
        }),
        center: {
            x: 0,
            opacity: 1,
            scale: 1,
            transition: {
                x: { type: 'spring', stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.3 }
            }
        },
        exit: (direction: number) => ({
            x: direction < 0 ? '100vw' : '-100vw',
            opacity: 0,
            scale: 0.98,
            transition: {
                x: { type: 'spring', stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.3 }
            }
        })
    };

    return (
        <div className="fixed inset-0 flex flex-col bg-black overflow-hidden font-sans text-white select-none"
            style={{ height: 'var(--app-height, 100vh)' }}>

            {/* Dynamic Header */}
            {activeTab !== 'heatmap' && (
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex-shrink-0 z-20"
                >
                    <MobileHeader />
                </motion.div>
            )}

            {/* Main Content Area */}
            <main className="relative flex-grow w-full overflow-hidden">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={activeTab}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className={`absolute inset-0 w-full h-full scroll-smooth touch-pan-y ${activeTab === 'heatmap'
                            ? 'overflow-hidden p-0'
                            : 'overflow-y-auto px-4 py-2 pb-20'
                            }`}
                        style={{
                            WebkitOverflowScrolling: 'touch'
                        }}
                    >
                        {screens[activeTab]}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Navigation Tab Bar */}
            <div className="flex-shrink-0 z-20 bg-[#0f0f0f] border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
                <MobileTabBar activeTab={activeTab} onTabChange={onTabChange} />
            </div>
        </div>
    );
}
