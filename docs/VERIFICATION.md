# Verificare

- `npm run check`: trecut (sintaxă server, store și frontend).
- `npm test`: 18/18 teste trecute.
- Browser desktop: autentificare demo client, pașaport, sold 200 puncte, look salvat, reprogramare cu serviciu/specialist preselectat și confirmare persistată; generare QR real și expirare afișată.
- Verificare automată HTTP: QR PNG, protecție Origin, rol client neescaladabil prin înregistrare, logout și sesiune invalidată.
- Testele de persistență închid/redeschid baza și verifică sesiunile și vizitele.
- Scanarea fizică prin cameră și aspectul pe telefoane reale nu au fost verificate; fallback-ul prin cod există. CSS include praguri pentru 320–430 px și temă automată.
- Deploy Docker, HTTPS public și GitHub Actions necesită rulare în mediul țintă; nu sunt declarate verificate prin testele locale.
