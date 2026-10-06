# Backlink Outreach Package (€0)

Cieľ: earned linky od finančných blogov/newsletterov cez naše dáta a embed widgety.
Všetko je pripravené — stačí odoslať zo svojej adresy.

## Čo ponúkame (naše assety)

| Asset | URL | Pre koho |
|---|---|---|
| Movers widget (iframe) | `premarketprice.com/embed` (snippety na stránke) | blogy, newslettry, sidebar |
| Heatmap widget | `premarketprice.com/embed/heatmap` | väčšie stránky, dashboards |
| Biggest-moves leaderboard | `premarketprice.com/biggest-movers` | citácie v článkoch, "podľa dát…" |
| Denný movers archív | `premarketprice.com/premarket-gainers/[YYYY-MM-DD]` | denné recap články |
| Ticker analýza | `premarketprice.com/analysis/[TICKER]` | deep-dive odkazy |

## Pripravený dátový snippet (overené z prod DB)

```
Biggest official-close moves (premarketprice.com data):
• CRML +38.6% (Sep 21) — Critical Metals
• PTC  +33.5% (Oct 5) — $23.7B Schneider Electric acquisition
• XP   +30.9% (Oct 5) — Brazilian election rally
• NVAX +20.1% (Oct 5) — Novavax
• NAVN −21.7% (Sep 10), TWST −18.6% (Oct 6), TXG −17.5% (Oct 6)
```

`all-time` leaderboard je živý — nové dáta sa dopĺňajú každý deň po close.

## Cieľové skupiny (kontakty hľadaj na ich weboch)

### A. Denné "market movers" recap blogy/newslettry — najvyšší fit
Píšu presne to, čo my dátovo kryjeme. Pitch = widget + denný snippet.
- Substack: finančné newslettry s "daily movers" rubrikou (search "daily stock movers newsletter")
- Malé/mediuim investing blogy publikujúce "today's top gainers" posty
- `stocktwits.com` blog / comtéta — publikujú daily movers content
- `marketbeat.com`-style roundup weby (majú editors guidelines pre contributions)

### B. Personal-finance / investing blogy
- Väčšina má "resources/tools" stránku → pitch widget ako "free tool for readers"
- Hľadaj: "best free stock tools" články → ponúkni zaradenie

### C. Podcast/show-notes & YouTube kanály o trhoch
- Show notes linkujú dátové zdroje — movers widget sa hodí

### D. r/stocks, r/wallstreetbets, Stocktwits komunita
- Nie backlink, ale referral + brand awareness → nepriamo k linkom

## Email drafty

### Draft A — widget pitch (blog/newsletter owner)

```
Subject: Free live "market movers" widget for {site}

Hi {name},

I run PreMarketPrice — we publish real-time US market movers data
(pre-market, regular session, after-hours) with catalysts and stats.

I noticed {site} covers daily movers / market recaps. We built a free
embeddable widget that keeps a live movers list on your page with zero
work — iframe snippet, ~1 min setup:

https://premarketprice.com/embed

Example of today's board: {2–3 aktuálne tickery z /biggest-movers}

Happy to also supply a custom daily data feed if that's more useful than
the iframe. Either way — free, no strings, attribution link is built in.

{signature}
```

### Draft B — data citation (journalist/blogger)

```
Subject: Data: {ticker} moved {X}% — tracked in our leaderboard

Hi {name},

Saw your coverage of {topic/ticker}. Quick data point that might be
useful for a follow-up: per official regular-session closes, {ticker}'s
{+/-X}% move on {date} ranks among the top single-day moves we've tracked
({rank}th since Sep 2026).

Full leaderboard (updated daily, official closes only):
https://premarketprice.com/biggest-movers

Feel free to cite/quote — attribution link appreciated.

{signature}
```

### Draft C — tools/resources page listing

```
Subject: Resource suggestion: free real-time movers data

Hi {name},

Your "{article}" list mentions {related tool}. We run
https://premarketprice.com — free real-time pre-market/after-hours movers
with catalysts, sector heatmaps and a daily leaderboard. Also embeddable
widgets (free): https://premarketprice.com/embed

Worth a look for your readers?

{signature}
```

## Execution checklist (ty)

1. [ ] Z /embed skopíruj si hotové snippety (tam sú live)
2. [ ] Vyber ~15 cieľov: ~8 daily-movers newsletrov, ~5 tools/resources stránok, ~2 youtuberi/podcasty
3. [ ] Každý mail personalizuj 1 vetou ({site}, {article}, {ticker})
4. [ ] Posielaj Po–Št 9:00–11:00 US času, max 5–6/deň
5. [ ] Follow-up raz po ~7 dňoch, jednou vetou
6. [ ] Reálne očakávanie: 1–3 linky z ~15 mailov = norma

## Poznámky

- Nikdy neponúkaj peniaze za link — tým sa stávaš paid-link a znehodnotíš ho
- "Free to cite — link appreciated" je legit a funguje
- Referral linky z embedov nesú `utm_source=embed` — vidíš ich v GA4
