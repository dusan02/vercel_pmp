# 📊 Worker Performance Summary (Latest Run)

**Dátum:** 2025-11-26  
**Čas merania:** 08:47 UTC (Market Closed / Pre-market)  
**Status Aplikácie:** ✅ Running (localhost:3000)

---

## ⏱️ Nameralé Hodnoty

| Komponent | Status | Prvý Cyklus | Aktivita | Poznámka |
|-----------|--------|-------------|----------|----------|
| **Next.js App** | ✅ Ready | 1.48s | - | Beží na porte 3000 |
| **Refs Worker** | ✅ Active | 4.53s | 50 ops | Bootstrapping previous closes |
| **Snapshot Worker** | ⏸️ Idle | - | 0 cycles | **Market Closed** (3:47 AM EST) |

---

## 📉 Detail Workerov

### Refs Worker (Active)
- **Startup:** Okamžitý
- **Výkon:** Veľmi rýchly (4.53s na prvú operáciu)
- **Činnosť:** Úspešne nastavil "previous close" hodnoty pre stovky tickerov (videné v logoch).
- **Cykly:** 50 zaznamenaných operácií za 2 minúty.

### Snapshot Worker (Idle)
- **Dôvod:** Aplikácia detekovala zatvorený trh (`Market closed (session: closed)`).
- **Správanie:** Worker sa správne uspal a nesťahoval zbytočne dáta, keďže burza nebeží.
- **Dáta:** Žiadne nové snapshoty neboli spracované (očakávané správanie).

---

## 📝 Zhodnotenie
Aplikácia aj workery fungujú **správne**.
1. Aplikácia naštartovala bez chýb.
2. Refs worker správne dopĺňa chýbajúce historické dáta (previous close).
3. Snapshot worker správne rešpektuje otváracie hodiny burzy a neplytvá API limitmi mimo obchodných hodín.

**Odporúčanie:**
Pre otestovanie Snapshot workera (live dát) je potrebné spustiť test **po 15:30 SEČ (9:30 AM EST)**, kedy sa otvorí US trh, alebo použiť mockované dáta.

