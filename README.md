# Secret Santa (Next.js + Supabase)

Losowanie osób na prezenty **bez logowania**. Wpisujesz nazwę pokoju, dostajesz link, wysyłasz go
uczestnikom. Każdy otwiera link, wybiera swoją tożsamość z listy przygotowanej przez admina i losuje.
Wynik widzi tylko losujący.

## Jak to działa

- Każda przeglądarka dostaje **anonimową sesję Supabase** (`signInAnonymously`) z prawdziwym `auth.uid()`.
  Dzięki temu RLS i funkcje SQL działają bez zmian.
- `/` tworzy pokój (twórca = admin). `/join/?code=KOD` dołącza do pokoju. `/room/?id=ID` to widok pokoju.
- Aplikacja to eksport statyczny (`out/`): bez serwera, więc działa na GitHub Pages.
- Admin dodaje osoby i zatwierdza pokój (wymaga ≥ 3 osób). Zatwierdzenie od razu losuje przydziały dla wszystkich.
- Każdy może w dowolnym momencie wejść do pokoju, wybrać swoją tożsamość (zajętej nie da się przejąć) i wylosować. Wynik odsłania się tylko losującemu.
- Prywatność wymuszają RLS i funkcje `SECURITY DEFINER` w bazie (szczegóły w migracji).

**Uwaga:** tożsamość jest przypisana do przeglądarki. Wyczyszczenie danych witryny lub inne urządzenie
oznacza nową sesję, więc trzeba wrócić z tej samej przeglądarki.

## Publikacja na GitHub Pages

1. Wypchnij repozytorium na GitHub (gałąź `main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**: dodaj `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key; nigdy `service_role`).
4. Każdy push na `main` uruchamia `.github/workflows/pages.yml`. Strona będzie pod `https://UZYTKOWNIK.github.io/NAZWA-REPO/`.

`BASE_PATH` ustawia workflow na `/NAZWA-REPO`. Lokalnie zostaje pusty. Plik `.nojekyll` jest tworzony, żeby GitHub Pages nie ukrywał katalogu `_next`.

## Uruchomienie

```bash
npm install
cp .env.example .env.local     # URL i publishable key projektu
npm run dev                    # http://localhost:3000
```

**Projekt zdalny:** w Dashboardzie włącz **Authentication → Sign In / Providers → Anonymous Sign-Ins**.
Bez tego `signInAnonymously` zwróci błąd.

**Lokalnie:** `npx supabase start`, potem `npx supabase db reset` (config ma już włączone konta anonimowe).

## Testy

```bash
npm run test:db    # pgTAP: RLS, uprawnienia, losowanie, 300 losowych gier
npm test           # Vitest: mapowanie błędów; test prywatności przez API (wymaga Supabase)
npm run typecheck
```

`tests/privacy.integration.test.ts` wymaga działającego Supabase i `SUPABASE_SERVICE_ROLE_KEY`
(tylko do testów, nigdy z prefiksem `NEXT_PUBLIC_`).

## Ręczny test punktu 5

1. Przeglądarka A tworzy pokój, dodaje Ala, Bartek, Celina, kopiuje link, zatwierdza pokój.
2. Okno prywatne (B) otwiera link, wybiera Bartka i klika „Losuj”. C dołącza później, wybiera Celinę i losuje.
3. W konsoli B: `await supabase.from('draws').select('*')` → błąd braku uprawnień (klient nie czyta tabeli `draws`).
4. `await supabase.rpc('get_my_draw', { p_room: ID })` → tylko wynik B; przed losowaniem `null`.
5. Admin (A) widzi w panelu wyłącznie licznik „jeszcze nie losowały”, bez wyników innych osób.
