# Salon Passport

## Demo online

[Deschide aplicația](https://nistordaniel06-cpu.github.io/salon-passport-network/) · selectează Client, PRO sau Admin din bara de sus.

GitHub Pages prezintă aceeași interfață folosind un simulator local, cu date fictive în browser. Nu există autentificare reală, sincronizare între dispozitive sau validare securizată a codurilor în acest demo. Nu introduce date reale. Butonul Resetează reface demonstrația. Serverul complet rămâne separat, cu SQLite și verificări server-side.

Build demo: `node scripts/build-preview.mjs`. Publicarea este automată din main prin workflow-ul Publish interactive demo.


**Descoperă. Rezervă. Revino.** Un pilot funcțional pentru a transforma vizita din salon în următoarea programare.

Pașaport privat al stilului, rezervări, check-in QR temporar, confirmarea serviciului, puncte pe salon și repetarea look-ului. Trei intrări separate: `/client`, `/pro`, `/admin`.

## Pornește demonstrația

Necesită Node.js 24 sau mai nou.

```bash
npm ci
npm run dev
```

Deschide `http://localhost:4173/client`. Butonul **Intră în contul demo** există exclusiv în modul demonstrativ. `/pro` și `/admin` au propriul cont demo. Datele demo sunt persistente în `data/demo.sqlite`, ignorat de Git.

Conturi fictive: `client@demo.local`, `pro@demo.local`, `pro2@demo.local`, `admin@demo.local`. Parolă exclusiv demo: `Passport-Demo-2026!`. Niciun cont demo nu este creat în modul normal. Demo nu pornește cu `NODE_ENV=production`.

## Ce funcționează

- Înregistrare client, login cu parolă hash-uită scrypt, sesiuni persistente HttpOnly.
- Server Node și bază SQLite, fără servicii externe obligatorii.
- Descoperire saloane; alegere serviciu, profesionist și interval; anulare.
- Servicii de 15–240 minute, program săptămânal per specialist, pauze și blocări/concedii. Ore Europe/Bucharest; verificare tranzacțională a suprapunerilor.
- QR real PNG: token aleator opac, hash stocat pe server, expirare la 5 minute, o singură utilizare. Un cod nou îl invalidează pe cel vechi.
- Check-in doar pentru profesionistul rezervat, în salonul corect, în fereastra de ±2 ore față de programare.
- Finalizare numai după check-in. Maximum o acordare de 100 puncte per vizită, inclusiv la retrimiterea cererii.
- Recompense per salon, QR valabil 10 minute. Punctele sunt scăzute doar la validarea profesională, o singură dată.
- Look privat cu preferințe și fotografie opțională (JPEG/PNG/WebP, max. 500 KB); consimțământ explicit.
- „Repetă acest look” preselectează serviciul și specialistul, apoi cere confirmarea intervalului.
- Recenzie salvată numai pentru vizită finalizată; publicarea în profilul salonului este amânată.
- Admin creează saloane, profesioniști, servicii și recompense. Audit al acțiunilor importante.
- Indicatori calculați din date: vizite, clienți reveniți, rezervări ulterioare și valoarea serviciilor, nu plăți încasate.
- UI română, responsive, temă automată deschis/închis, QR compact, navigație mobilă.

## Teste

```bash
npm run check
npm test
```

22 teste acoperă izolarea dintre clienți/saloane, rolurile, replay/expirare QR, finalizare idempotentă, rezervări concurente la nivel tranzacțional, recompense, fotografii, sesiuni persistente și API HTTP cu control de origine. Workflow GitHub Actions inclus.

## Test manual în cinci pași

1. `/client` → demo → QR-ul vizitei demonstrative curente; copiază codul de sub QR.
2. Ieși din cont → `/pro` → demo → Scanează → introdu codul → Validează.
3. În agendă apasă **Finalizează vizita**. Clientul primește 100 puncte o singură dată.
4. Revino în contul client → Passport → revendică beneficiul. Codul se validează în PRO.
5. Alege **Repetă acest look**, confirmă un interval și verifică aceeași rezervare în PRO.

Camera folosește API-ul BarcodeDetector dacă browserul îl oferă și necesită HTTPS. Introducerea manuală funcționează și fără cameră. Conturile folosesc aceeași sesiune în același browser; pentru folosire simultană client/PRO sunt necesare browsere/profiluri diferite.

## Rulare normală și găzduire

1. Instalează dependențele cu `npm ci`.
2. Copiază `.env.example` în `.env` și configurează `APP_ORIGIN` cu originea HTTPS exactă; setează `ADMIN_EMAIL` și o parolă inițială unică de minimum 12 caractere.
3. Pornește cu `node --env-file=.env server.mjs`.
4. Accesează `/admin`, creează salonul, profesionistul, serviciul și recompensa. Clientul își creează singur un cont.
5. După crearea primului administrator, elimină parola de bootstrap din configurarea serviciului. Nu este reutilizată pentru resetarea contului.

Pentru Docker: construiește imaginea și montează un volum persistent la `/app/data`; setează `APP_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` prin secret manager și expune serviciul prin proxy HTTPS. Un singur proces de aplicație, disc persistent și backup SQLite sunt necesare. GitHub Pages și hostingul exclusiv static nu pot executa acest server. Deploymentul online nu este inclus automat prin simpla încărcare pe GitHub.

## Limitele pilotului

Nu este lansare comercială publică. Autentificarea este funcțională, dar recuperarea parolei, verificarea emailului, MFA și administrarea completă a conturilor sunt următorii pași. Pilotul nu include manager/owner separat, plăți, pachete de ședințe, abonamente între saloane, notificări, integrare cu un calendar extern, feed social, referral sau export/ștergere self-service. Nu există AI generativ conectat: recomandările afișate sunt etichetate ca reguli. Fotografiile nu sunt partajate cu alți saloane sau profesioniști în acest pilot.

Nu există sincronizare cu Salon OS/Barbercraft sau acces la bazele lor reale. Datele pentru noul pilot sunt independente. Înaintea oricărei integrări trebuie stabilită o sursă unică a programărilor și testată autorizarea între sisteme.

Vezi [arhitectura](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md) și [verificarea](docs/VERIFICATION.md).

## Programul profesioniștilor

PRO → Program configurează cele șapte zile și pauzele. Ore implicite: luni–sâmbătă 09–18, pauză 13–13:30; duminică închis. Acestea sunt valori de pornire, nu programul real confirmat al 4MEN. Modificarea orarului nu anulează programările existente. Blocările sunt respinse dacă intersectează programări active. Admin stabilește durata la adăugarea unui serviciu. Durata rezervării se salvează separat pentru a păstra istoricul.

Publicarea serverului real și configurarea identității proprietarului rămân neefectuate. GitHub Pages continuă să fie doar simulatorul local.

## Calendar PRO

Agenda are vedere Zi, 7 zile și Listă, selector de dată și revenire la Astăzi. Atinge programarea pentru detalii. Specialistul poate modifica data, ora și serviciul doar pentru propriile programări neîncepute. Salvarea reverifică disponibilitatea într-o tranzacție, respinge editările bazate pe date vechi și invalidează QR-ul anterior. Anularea eliberează intervalul și se păstrează în audit. Pauzele și blocările sunt afișate în calendar. Nu sunt activate sincronizarea cu Google/MERO, notificările automate sau drag-and-drop.

Proiect Supabase dedicat: `nepdywsvyxffnluixair`, Frankfurt. Doar provisionat; nu este încă legat de autentificarea sau datele aplicației.
