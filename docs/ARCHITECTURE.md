# Arhitectură pilot

Node.js 24 `node:http` + `node:sqlite`, frontend HTML/CSS/JavaScript fără build. `qrcode` este singura dependență directă. Separarea pe roluri se face pe server; ascunderea unui buton nu reprezintă autorizare.

## Model

`users` → `staff` → `salons`; `services` aparțin salonului. `visits` leagă clientul, salonul, serviciul și specialistul. `checkins` păstrează doar hash-ul tokenului. `ledger` este registrul de puncte pe client și salon, cu cheie unică pe vizita care acordă puncte. `claims` sunt consumabile și expiră. `looks` și `reviews` sunt legate de o vizită. `audit` păstrează acțiunile importante fără tokenuri sau parole.

## Tranziții

`booked → checked_in → completed`; `booked → cancelled`. Finalizarea repetată este idempotentă. Operațiunile critice folosesc `BEGIN IMMEDIATE`; indexul unic de slot împiedică dubla ocupare. Toate sloturile au aceeași durată în acest pilot, deci nu există suprapuneri parțiale de durate variabile.

Codul QR include doar `SP1:visit:<token>` sau `SP1:reward:<token>`. Nu conține numele, emailul, fotografiile sau istoricul. Check-in nu consumă puncte și nu produce recompense. La recompensă, soldul este verificat din nou în tranzacția de validare.

## Acces

Clientul vede numai propriile vizite, look-uri și registru. Profesionistul vede numai vizitele alocate lui și poate opera numai în salonul său. Administratorul configurează rețeaua și vede indicatori agregați și jurnalul, fără endpoint de citire a fotografiilor. Notele profesionale nu sunt returnate clientului.

Cookie HttpOnly, SameSite=Lax, Secure când APP_ORIGIN este HTTPS. Toate mutațiile cer JSON și Origin exact. Parolele folosesc scrypt cu salt aleator. CSP fără scripturi inline, escaping pentru conținutul utilizatorilor, dimensiune maximă cerere 800 KB. Rate limit autentificare: 30 încercări/15 minute per IP observat de aplicație. În spatele unui proxy comun, adăugați un rate limit separat la proxy; aplicația nu are încredere în X-Forwarded-For.

## Operare

Un singur server cu disc persistent. Backup cu mecanismul SQLite online sau oprirea controlată a aplicației; nu copiați doar fișierul principal în timp ce WAL este activ. Restabilirea unui backup trebuie verificată înaintea pilotului real. Erorile interne sunt generice pentru client.

Înainte de lansare publică: email verificat, recuperare acces, rotație/revocare sesiuni, audit securitate independent, politică de retenție, ștergere/export date și validare a configurării HTTPS. Nu folosiți conturile demo cu date reale.

## Surse de inspirație

Inspectate read-only: `nistordaniel06-cpu/salon-os/package.json`, `docs/SALON-PASSPORT-ROADMAP.md` și descrierea temei din `docs/SALON_PASSPORT_THEME_IMPLEMENTATION.md`. S-au păstrat regulile de produs, identitatea alb/albastru și separarea rolurilor. Implementarea este nouă; nu s-au copiat configurații, credențiale sau date de clienți. Celelalte repository-uri nu au fost modificate.
