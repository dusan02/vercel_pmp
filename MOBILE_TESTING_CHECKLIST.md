# 📱 Mobile Testing Checklist - PreMarketPrice.com

## 🎯 **Testovací Scenáre**

### 1. **PWA (Progressive Web App) Testy**

#### ✅ **Installation Test**
- [ ] **Desktop Chrome**: 
  - Otvoriť `http://localhost:3000`
  - Skontrolovať či sa zobrazí install prompt
  - Kliknúť "Install" - aplikácia sa nainštaluje
  - Spustiť z desktop ikony

#### ✅ **Mobile Installation Test**
- [ ] **Android Chrome**:
  - Otvoriť `http://localhost:3000` na mobile
  - Skontrolovať "Add to Home Screen" prompt
  - Pridať na home screen
  - Spustiť z home screen ikony

- [ ] **iOS Safari**:
  - Otvoriť `http://localhost:3000` na iPhone
  - Kliknúť Share button
  - Vybrať "Add to Home Screen"
  - Spustiť z home screen

#### ✅ **Offline Functionality**
- [ ] **Turn off WiFi/Data**
- [ ] **Refresh page** - mali by sa zobraziť cached dáta
- [ ] **Navigate between sections** - offline.html sa zobrazí
- [ ] **Check favorites** - mali by byť dostupné offline

### 2. **Touch Interactions Test**

#### ✅ **Swipe Gestures**
- [ ] **Swipe left on stock row** - mali by sa zobraziť akcie
- [ ] **Swipe right on stock row** - favorite/unfavorite
- [ ] **Long press** - context menu (ak implementované)

#### ✅ **Pull-to-Refresh**
- [ ] **Pull down on main content** - refresh spinner
- [ ] **Release when threshold reached** - data sa obnoví
- [ ] **Pull distance indicator** - vizuálna spätná väzba

#### ✅ **Touch Targets**
- [ ] **Favorite buttons** - minimálne 44px
- [ ] **Navigation items** - ľahko tappable
- [ ] **Search input** - veľké enough pre thumb
- [ ] **Filter controls** - touch-friendly

### 3. **Responsive Design Test**

#### ✅ **Desktop (1920x1080)**
- [ ] **Full layout** - všetky sekcie viditeľné
- [ ] **Table scrolling** - horizontal scroll funguje
- [ ] **Navigation** - top navigation

#### ✅ **Tablet (768px)**
- [ ] **Adaptive layout** - sekcie sa prispôsobia
- [ ] **Touch targets** - väčšie buttons
- [ ] **Bottom navigation** - zobrazí sa

#### ✅ **Mobile (375px)**
- [ ] **Mobile-first layout** - optimalizované pre mobile
- [ ] **Bottom navigation** - hlavná navigácia
- [ ] **FAB (Floating Action Button)** - quick actions
- [ ] **Touch-friendly tables** - scrollable

#### ✅ **Small Mobile (320px)**
- [ ] **Ultra-compact layout** - všetko sa zmestí
- [ ] **Readable text** - font sizes appropriate
- [ ] **Touch targets** - minimálne 44px

### 4. **Performance Test**

#### ✅ **Loading Speed**
- [ ] **First Load** - < 3 sekundy
- [ ] **Subsequent loads** - < 1 sekunda
- [ ] **Image loading** - lazy loading funguje
- [ ] **API responses** - rýchle

#### ✅ **Core Web Vitals**
- [ ] **FCP (First Contentful Paint)** - < 1.8s
- [ ] **LCP (Largest Contentful Paint)** - < 2.5s
- [ ] **CLS (Cumulative Layout Shift)** - < 0.1
- [ ] **FID (First Input Delay)** - < 100ms

### 5. **Cross-Device Testing**

#### ✅ **Android Devices**
- [ ] **Samsung Galaxy S21** - Chrome
- [ ] **Google Pixel 6** - Chrome
- [ ] **OnePlus 9** - Chrome
- [ ] **Samsung Tab S7** - Chrome

#### ✅ **iOS Devices**
- [ ] **iPhone 13** - Safari
- [ ] **iPhone 12** - Safari
- [ ] **iPad Air** - Safari
- [ ] **iPhone SE** - Safari

#### ✅ **Desktop Browsers**
- [ ] **Chrome** - Windows/Mac
- [ ] **Firefox** - Windows/Mac
- [ ] **Safari** - Mac
- [ ] **Edge** - Windows

### 6. **Feature Testing**

#### ✅ **Navigation**
- [ ] **Bottom navigation** - Home, Favorites, Earnings, All Stocks
- [ ] **Section switching** - smooth transitions
- [ ] **Active states** - visual feedback

#### ✅ **Data Display**
- [ ] **Stock data** - real-time updates
- [ ] **Favorites** - add/remove functionality
- [ ] **Search** - filter stocks
- [ ] **Sorting** - by various criteria

#### ✅ **PWA Features**
- [ ] **Service Worker** - offline functionality
- [ ] **Background Sync** - data updates
- [ ] **Push Notifications** - market alerts
- [ ] **App Shortcuts** - quick actions

### 7. **Accessibility Test**

#### ✅ **Screen Reader**
- [ ] **NVDA (Windows)** - navigation
- [ ] **VoiceOver (iOS)** - navigation
- [ ] **TalkBack (Android)** - navigation

#### ✅ **Keyboard Navigation**
- [ ] **Tab navigation** - všetky elements accessible
- [ ] **Enter/Space** - activate buttons
- [ ] **Arrow keys** - navigate tables

#### ✅ **Color Contrast**
- [ ] **Text contrast** - WCAG AA compliant
- [ ] **Button contrast** - accessible
- [ ] **Link contrast** - visible

### 8. **Error Handling**

#### ✅ **Network Errors**
- [ ] **No internet** - offline message
- [ ] **Slow connection** - loading states
- [ ] **API errors** - error messages

#### ✅ **User Errors**
- [ ] **Invalid input** - validation messages
- [ ] **Empty states** - helpful messages
- [ ] **Loading states** - progress indicators

## 🚀 **Testovacie Nástroje**

### **Browser DevTools**
```bash
# Chrome DevTools
F12 -> Device Toolbar -> Select device
```

### **Mobile Testing**
```bash
# Enable mobile testing
$env:NEXT_PUBLIC_ENABLE_MOBILE_TESTING="true"
npm run dev
```

### **Performance Testing**
```bash
# Run performance tests
npm run test:performance
```

### **Lighthouse Audit**
```bash
# Chrome DevTools -> Lighthouse
# Run audit for Performance, Accessibility, Best Practices, SEO
```

## 📊 **Expected Results**

### **Performance Targets**
- **Lighthouse Score**: > 90
- **First Load**: < 3s
- **Core Web Vitals**: All green
- **Bundle Size**: < 250KB

### **Mobile Experience**
- **Touch Targets**: > 44px
- **Swipe Gestures**: Smooth
- **Pull-to-Refresh**: Working
- **PWA Installation**: Available

### **Cross-Device Compatibility**
- **Android**: Chrome, Samsung Internet
- **iOS**: Safari
- **Desktop**: Chrome, Firefox, Safari, Edge

## 🎯 **Success Criteria**

✅ **Aplikácia funguje na všetkých testovaných zariadeniach**
✅ **PWA installation funguje na mobile**
✅ **Touch interactions sú smooth a responsive**
✅ **Performance je v norme (Lighthouse > 90)**
✅ **Offline functionality funguje**
✅ **Accessibility je compliant**

---

**Testovanie vykonáva:** [Tester Name]
**Dátum:** [Date]
**Verzia:** [Version] 