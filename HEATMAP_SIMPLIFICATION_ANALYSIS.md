# Analýza zjednodušenia heatmapy na úvodnej stránke

## Súčasná štruktúra kontajnerov (5-6 úrovní!)

### Desktop:
```
HomePage.tsx
└── <div id="section-heatmap" className="scroll-mt-20">
    └── <HomeHeatmap wrapperClass="desktop-heatmap-wrapper">
        └── <SectionErrorBoundary>
            └── <div className="desktop-heatmap-wrapper w-full h-full">
                └── <HeatmapPreview>
                    └── <section className="heatmap-preview">
                        └── <div className="heatmap-preview-container" style={{height: '400px'}}>
                            └── <div className="w-full h-full">  ← ZBYTOČNÝ!
                                └── <ResponsiveMarketHeatmap>
                                    └── <div className="mobile-heatmap-wrapper">
                                        └── <MarketHeatmap>
                                            └── <div className="heatmapContainer">
```

### Mobile:
```
HomePage.tsx
└── <MobileScreen className="screen-heatmap">
    └── <HomeHeatmap wrapperClass="mobile-heatmap-wrapper">
        └── <SectionErrorBoundary>
            └── <div className="mobile-heatmap-wrapper w-full h-full">
                └── <HeatmapPreview>
                    └── <section className="heatmap-preview h-full flex flex-col">
                        └── <div className="heatmap-preview-container flex-1">
                            └── <div className="w-full h-full min-h-0">  ← ZBYTOČNÝ!
                                └── <ResponsiveMarketHeatmap>
                                    └── <div className="mobile-heatmap-wrapper">
                                        └── <MobileTreemap>
```

## Problémy

1. **Zbytočný wrapper v HeatmapPreview.tsx:**
   - `<div className="w-full h-full">` vnútri `heatmap-preview-container` je zbytočný
   - `heatmap-preview-container` už má `w-full` a výšku, vnútorný div len pridáva úroveň

2. **Duplicitné CSS pravidlá:**
   - `.desktop-heatmap-wrapper` a `.mobile-heatmap-wrapper` majú podobné pravidlá
   - `.heatmap-preview-container` má duplicitné pravidlá pre desktop a mobile

3. **Zbytočný wrapper v HomeHeatmap.tsx:**
   - `<div className="${wrapperClass} w-full h-full">` môže byť zlúčený s `HeatmapPreview`

4. **Inline styles vs CSS:**
   - `height: '400px'` v inline style namiesto CSS
   - `minHeight: '400px'` duplikuje height

## Navrhované zjednodušenia

### 1. Odstrániť zbytočný wrapper v HeatmapPreview.tsx

**Pred:**
```tsx
<div className="heatmap-preview-container" style={{ height: '400px' }}>
  <div className="w-full h-full">  ← ZBYTOČNÝ
    <ResponsiveMarketHeatmap />
  </div>
</div>
```

**Po:**
```tsx
<div className="heatmap-preview-container" style={{ height: '400px' }}>
  <ResponsiveMarketHeatmap />
</div>
```

### 2. Zlúčiť HomeHeatmap a HeatmapPreview (voliteľné)

**Pred:**
```tsx
<HomeHeatmap wrapperClass="desktop-heatmap-wrapper">
  <SectionErrorBoundary>
    <div className="desktop-heatmap-wrapper w-full h-full">
      <HeatmapPreview />
    </div>
  </SectionErrorBoundary>
</HomeHeatmap>
```

**Po:**
```tsx
<SectionErrorBoundary sectionName="Heatmap">
  <HeatmapPreview wrapperClass="desktop-heatmap-wrapper" />
</SectionErrorBoundary>
```

### 3. Zjednodušiť CSS

**Pred:**
```css
.desktop-heatmap-wrapper {
  overflow: hidden !important;
}

.desktop-heatmap-wrapper .heatmap-preview-container {
  overflow: hidden !important;
}

.desktop-heatmap-wrapper .heatmap-preview-container > div {
  overflow: hidden !important;
}
```

**Po:**
```css
.heatmap-preview-container {
  overflow: hidden !important;
  width: 100%;
  height: 100%;
}
```

### 4. Presunúť inline styles do CSS

**Pred:**
```tsx
<div style={{ height: '400px', minHeight: '400px', cursor: 'pointer' }}>
```

**Po:**
```tsx
<div className="heatmap-preview-container heatmap-preview-desktop">
```

```css
.heatmap-preview-desktop {
  height: 400px;
  min-height: 400px;
  cursor: pointer;
}
```

## Očakávané zlepšenia

1. **Menej DOM elementov** - rýchlejší render
2. **Jednoduchší CSS** - menej duplicitných pravidiel
3. **Lepšia čitateľnosť** - menej vnorených divov
4. **Jednoduchšia údržba** - menej miest na chyby
