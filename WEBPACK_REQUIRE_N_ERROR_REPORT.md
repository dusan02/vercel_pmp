# Webpack Error Report: `__webpack_require__.n is not a function`

## 🔴 Problem Description

**Error:** `TypeError: __webpack_require__.n is not a function`

**Location:** Multiple files:

- `global-error.tsx:7`
- `error.tsx:7`
- `ErrorBoundaryWrapper.tsx:7`
- `not-found.tsx:7`
- `HomePage.tsx:7`

**Behavior:**

- Error appears on page load
- Prevents page from rendering correctly
- Affects all error boundaries and client components

---

## 📁 Current Code Configuration

### 1. `next.config.ts` - Webpack Configuration

```typescript
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // ... other config ...

  // Webpack configuration - completely minimal to avoid __webpack_require__.n errors
  webpack: (config, { isServer }) => {
    // DO NOT modify config.optimization - Next.js manages this internally
    // DO NOT modify config.output - Next.js manages this internally

    // Only add fallbacks for Node.js modules on client (minimal)
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Mark socket.io-client as external on server only
    if (isServer) {
      if (!config.externals) {
        config.externals = [];
      }
      if (Array.isArray(config.externals)) {
        config.externals.push("socket.io-client");
      }
    }

    // SVG handling - use existing rules if available, otherwise skip
    const existingSvgRule = config.module.rules.find(
      (rule: any) => rule.test && rule.test.toString().includes("svg")
    );

    if (!existingSvgRule) {
      try {
        config.module.rules.push({
          test: /\.svg$/,
          use: ["@svgr/webpack"],
        });
      } catch (e) {
        // Skip if loader not available
      }
    }

    return config;
  },

  // ... rest of config ...
};

export default nextConfig;
```

### 2. `src/app/HomePage.tsx` - Dynamic Imports

```typescript
"use client";

import React, {
  useState,
  useEffect,
  Suspense,
  useMemo,
  useCallback,
} from "react";
import dynamic from "next/dynamic";

// All component imports moved to dynamic imports to fix webpack require error
const PerformanceOptimizer = dynamic(
  () =>
    import("@/components/PerformanceOptimizer").then((mod) => ({
      default: mod.PerformanceOptimizer,
    })),
  { ssr: false, loading: () => null }
);
const MobileTester = dynamic(
  () =>
    import("@/components/MobileTester").then((mod) => ({
      default: mod.MobileTester,
    })),
  { ssr: false, loading: () => null }
);
// ... more dynamic imports ...
const SectionNavigation = dynamic(
  () =>
    import("@/components/SectionNavigation").then((mod) => ({
      default: mod.SectionNavigation,
    })),
  { ssr: false, loading: () => null }
);
// ... rest of component ...
```

### 3. `package.json` - Dependencies

```json
{
  "dependencies": {
    "next": "^16.0.10",
    "react": "19.1.0",
    "react-dom": "19.1.0"
    // ... other deps ...
  },
  "devDependencies": {
    "@svgr/webpack": "^8.1.0"
    // ... other dev deps ...
  },
  "scripts": {
    "dev": "cross-env ENABLE_WEBSOCKET=true tsx server.ts",
    "dev:next": "cross-env ENABLE_WEBSOCKET=true next dev --turbopack -H 127.0.0.1 -p 3000",
    "dev:next:no-turbopack": "cross-env ENABLE_WEBSOCKET=true next dev -H 127.0.0.1 -p 3000"
    // ... other scripts ...
  }
}
```

---

## 🔍 Root Cause Analysis

### Possible Causes:

1. **Next.js 16 + React 19 Compatibility Issue**

   - Next.js 16.0.10 with React 19.1.0 might have webpack runtime incompatibility
   - `__webpack_require__.n` is a webpack helper function that might not be properly initialized

2. **SVG Loader Configuration**

   - `@svgr/webpack` loader might be interfering with webpack runtime
   - The way SVG rules are added might conflict with Next.js internal webpack config

3. **Dynamic Import Pattern**

   - Using `.then(mod => ({ default: mod.ComponentName }))` pattern might cause webpack to generate incorrect require statements
   - This pattern might not be compatible with Next.js 16's webpack setup

4. **Module Resolution Issues**

   - The `config.resolve.fallback` modifications might be affecting how webpack resolves modules
   - This could break webpack's internal runtime helpers

5. **Turbopack vs Webpack Conflict**
   - Script uses `--turbopack` flag, but webpack config is still being applied
   - This might cause conflicts between Turbopack and Webpack configurations

---

## 🛠️ Attempted Solutions (All Failed)

### Attempt 1: Minimal Webpack Config

- ✅ Removed all `optimization` modifications
- ✅ Removed `runtimeChunk` modifications
- ✅ Kept only essential fallbacks
- ❌ **Result:** Error persists

### Attempt 2: Dynamic Imports

- ✅ All components use `next/dynamic`
- ✅ All imports use `ssr: false`
- ❌ **Result:** Error persists

### Attempt 3: Cache Clearing

- ✅ Deleted `.next` directory multiple times
- ✅ Restarted dev server
- ❌ **Result:** Error persists

### Attempt 4: SVG Loader Removal

- ✅ Tried removing SVG loader configuration
- ❌ **Result:** Error persists

---

## 💡 Recommended Solutions

### Solution 1: Remove Webpack Config Entirely (Recommended)

**Try removing the entire webpack function from `next.config.ts`:**

```typescript
const nextConfig: NextConfig = {
  // ... other config ...
  // REMOVE webpack function entirely
  // webpack: (config, { isServer }) => { ... },
  // ... rest of config ...
};
```

**Rationale:** Next.js 16 might handle everything internally, and custom webpack config might be causing conflicts.

### Solution 2: Fix Export/Import Mismatch (CRITICAL)

**Problem Found:** Components use **named exports**, but dynamic imports expect **default exports**.

**Current Component Exports:**

```typescript
// SectionNavigation.tsx
export function SectionNavigation({ ... }) { ... }

// PortfolioSection.tsx
export function PortfolioSection({ ... }) { ... }

// HeatmapMetricButtons.tsx
export function HeatmapMetricButtons({ ... }) { ... }
```

**Current Dynamic Import Pattern:**

```typescript
const SectionNavigation = dynamic(
  () =>
    import("@/components/SectionNavigation").then((mod) => ({
      default: mod.SectionNavigation,
    })),
  { ssr: false, loading: () => null }
);
```

**Solution A: Change to Default Exports (Recommended)**

```typescript
// SectionNavigation.tsx
export default function SectionNavigation({ ... }) { ... }

// Then use standard dynamic import:
const SectionNavigation = dynamic(() => import('@/components/SectionNavigation'), {
  ssr: false,
  loading: () => null
});
```

**Solution B: Keep Named Exports, Fix Import Pattern**

```typescript
// Keep named exports, but fix the dynamic import:
const SectionNavigation = dynamic(
  () =>
    import("@/components/SectionNavigation").then(
      (mod) => mod.SectionNavigation
    ),
  { ssr: false, loading: () => null }
);
```

**This mismatch might be causing webpack to generate incorrect require statements!**

### Solution 3: Downgrade Next.js or React

**Try Next.js 15.x with React 18:**

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

**Rationale:** Next.js 16 + React 19 is relatively new and might have compatibility issues.

### Solution 4: Remove SVG Loader, Use Next.js Image

**Remove SVG loader from webpack config and use Next.js Image component or inline SVGs.**

### Solution 5: Use Turbopack Consistently

**Either:**

- Use `--turbopack` flag and remove webpack config entirely
- Or remove `--turbopack` flag and use standard webpack

**Don't mix both.**

---

## 🔬 Debugging Steps

1. **Check if error occurs without webpack config:**

   ```bash
   # Comment out webpack function in next.config.ts
   # Delete .next
   # Restart server
   ```

2. **Check if error occurs with standard dynamic imports:**

   ```typescript
   // Change all dynamic imports to standard pattern
   const Component = dynamic(() => import("@/components/Component"));
   ```

3. **Check webpack version:**

   ```bash
   npm list webpack
   ```

4. **Check if error occurs in production build:**

   ```bash
   npm run build
   npm start
   ```

5. **Check browser console for exact error location:**
   - Look at stack trace
   - Identify which module is causing the issue
   - Check if it's a specific component or all components

---

## 📊 Error Pattern Analysis

The error occurs in:

- `global-error.tsx:7` - Global error boundary
- `error.tsx:7` - Error page
- `ErrorBoundaryWrapper.tsx:7` - Error boundary wrapper
- `not-found.tsx:7` - 404 page
- `HomePage.tsx:7` - Main page component

**Common pattern:** All affected files are likely using:

- Dynamic imports
- Client components (`'use client'`)
- React hooks

**This suggests:** The webpack runtime helper `__webpack_require__.n` is not being properly initialized for client-side modules.

### Export/Import Mismatch Issue

**Components use named exports:**

```typescript
// src/components/SectionNavigation.tsx
export function SectionNavigation({ ... }) { ... }

// src/components/PortfolioSection.tsx
export function PortfolioSection({ ... }) { ... }
```

**But dynamic imports use `.then(mod => ({ default: mod.ComponentName }))` pattern:**

```typescript
// src/app/HomePage.tsx
const SectionNavigation = dynamic(
  () =>
    import("@/components/SectionNavigation").then((mod) => ({
      default: mod.SectionNavigation,
    })),
  { ssr: false, loading: () => null }
);
```

**This pattern creates a wrapper object `{ default: ... }` which might confuse webpack's module resolution and cause `__webpack_require__.n` to fail.**

---

## 🎯 Next Steps (Priority Order)

### Step 1: Fix Export/Import Mismatch (HIGHEST PRIORITY)

**This is likely the root cause!** Fix all dynamic imports to match export patterns:

**Option A: Convert to default exports (Recommended)**

```typescript
// Change all components from:
export function ComponentName() { ... }

// To:
export default function ComponentName() { ... }

// Then use standard dynamic import:
const Component = dynamic(() => import('@/components/Component'), {
  ssr: false,
  loading: () => null
});
```

**Option B: Fix dynamic import pattern for named exports**

```typescript
// Keep named exports, but fix import:
const Component = dynamic(
  () => import("@/components/Component").then((mod) => mod.ComponentName),
  { ssr: false, loading: () => null }
);
```

### Step 2: Remove Webpack Config

If Step 1 doesn't work, try removing webpack config entirely:

```typescript
// Comment out or remove the entire webpack function
// webpack: (config, { isServer }) => { ... },
```

### Step 3: Downgrade Next.js/React

If Steps 1-2 fail, try Next.js 15 with React 18:

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

### Step 4: Check Next.js GitHub Issues

Search for: "next.js 16 **webpack_require**.n react 19"

---

## 📝 Additional Context

- **Next.js Version:** 16.0.10
- **React Version:** 19.1.0
- **Node Version:** (check with `node -v`)
- **Package Manager:** npm
- **Build Tool:** Webpack (via Next.js)
- **Development Server:** Custom server with `tsx server.ts`

---

## 🔗 Related Issues

- [Next.js GitHub: webpack require errors](https://github.com/vercel/next.js/issues?q=__webpack_require__.n)
- [Next.js 16 Release Notes](https://nextjs.org/blog/next-16)
- [React 19 Compatibility](https://react.dev/blog/2024/04/25/react-19)

---

**Report Generated:** 2025-12-13
**Status:** 🔴 **CRITICAL - Blocking Development**
