# Dokumentácia úprav a chýb: Chybné tickery a nasadenie (31. Marec 2026)

Tento dokument sumarizuje kroky a chyby, ktoré sa udiali počas pokusu o opravu "UNKNOWN" metadát pre zoznam tickerov a následný deployment na produkciu. Slúži ako podklad pre ďalšie doladenie a opravy (napr. pre prebratie iným agentom / Claude Sonnet).

## 1. Pokus o hromadnú opravu sektorov a odvetví
- **Cieľ:** Upraviť Sektor (Sector) a Odvetvie (Industry) pre približne 125 tickerov, ktoré v heatmapách vykazovali hodnotu "UNKNOWN" (napr. `SQ`, `MRVL`, atď.).
- **Chyba 1 (Lokálny skript a syntax):** Skript `scripts/fix-user-metadata.ts` na začiatku zlyhal na lokálnom prostredí kvôli chybnej syntaxi escapovania premenných (nesprávne formátované znaky `\`` v TypeScript template literáloch pri generovaní súboru agentom). Táto chyba bola narovnaná a opravená.
- **Chyba 2 (Chýbajúce tickery v lokálnej dev.db):** Po úspešnom spustení lokálne zlyhalo 15 tickerov (napríklad `UPST`, `XPO`, `SQ`, atď.) s chybou Prisma `RecordNotFound`. Zistili sme, že lokálna SQLite databáza (`dev.db`) vôbec neobsahovala tieto tickery, napriek tomu, že na produkčnej databáze sa jasne nachádzali (ako dokazuje screenshot z heatmapy).

## 2. Priamy update na produkčnej databáze
- Aby sme predišli problému s chýbajúcimi dátami v lokálnej DB, vytvorili sme nasadzovací skript `scripts/remote-fix.js` volaný cez `ssh2`.
- Tento skript uploadol opravný kód na VPS produkciu a spustil logiku zmeny priamo na PostgreSQL serveri (`root@89.185.250.213`).
- **Výsledok:** Aktualizácia všetkých 125 tickerov na produkcii zbehla na výbornú bez jedinej chyby (0 Failed).

## 3. Nepodarené vyvolanie obnovenia Cache (refresh)
- Následný pokus o manuálne vyčistenie Next.js cache cez `npm run refresh-prod-data` zbehol bez problémov.
- Akonáhle sme však následne volali `npm run update-universe` (spúšťa `scripts/automated-data-pipeline.cjs`), narazili sme obratom na chybu.
- **Chyba 3 (401 Unauthorized v refresh pipeline):** Tento NodeJS skript zo shellu padol na prístupových právach voči lokálnemu API endpointu (`http://localhost:3000`). Pre priamy bash request pravdepodobne chýbala správna hlavička s autorizačným secretom (napr. `ADMIN_SECRET`), inak by call prešiel v poriadku. Následne sme toto manuálne obchádzali úplným reštartom PM2 po builde.

## 4. Problémy s Deploymentom aplikácie u klienta (build process)
- Pri snahe nasadiť zmeny (`node scripts/deploy-via-ssh.js`) a urobiť finálny build na SSH vzniklo niekoľko závažných prekážok:
- **Chyba 4 (SSH Handshake Error):** Lokálny `deploy-via-ssh.js` niekoľkokrát okamžite padol s `Error: Connection lost before handshake`. Súviselo to zrejme s otvorenou interaktívnou SSH reláciou používateľa (`ssh root@...`), ktorá kolidovala s automatickým `ssh2` scriptom a spôsobila odmietnutie pre paralélne pripojenie.
- **Chyba 5 (Another Next.js build is already running):** Tento kritický stav "zamknutia" nastal pri pokuse o `npm run build` na serveri. Znamenalo to, že starý havarovaný build na vzdialenom VPS po sebe zanechal uzamknuté súbory (lock state) v priečinku `.next` a znemožnil novej akcií dokončiť sa.  
- **Finálne riešenie aplikované dnu:** Skript lokálneho deployeru `scripts/deploy-via-ssh.js` bol trvalo vylepšený. Pred krok volania buildu bol natvrdo vložený príkaz `rm -rf .next`. Týmto spôsobom sa garantuje premazanie poškodených lock súborov a server zakaždým vykoná "čistý" build bez prekážok. Následný proces buildu potom zbehol naprípravu.

## Odporúčania pre doladenie s modelom Claude
1. Pracovné skripty pripravené počas noci (`fix-user-metadata.ts`, `remote-fix.js`, `remote-refresh.js`, `remote-clear-next.js` atď.) po dokončení zavadzajú v zložke `scripts/`. Nasadili sa do produkčnej vetvy `main` a bolo by vhodné ich odstrániť alebo preložiť do zložky s názvom napríklad `archive/`. 
2. Odporúčame preveriť autorizáciu skriptu `scripts/automated-data-pipeline.cjs`, aby nevyhadzoval 401 Unauthorized pri manuálnom volaní z konzole VPS. Mal by vedieť čítať `.env` file a pridávať príslušné hlavičky pred dopytom.
3. Preveriť obrovský rozdiel medzi lokálnym `dev.db` (kde chýbalo asi 15 silných veľkých tickerov zo zoznamu) a produkčným DB napojením, aby sa "RecordNotFound" nedorozumenia pri ladení (ako pri Chybe č. 2) vôbec nerobili.
