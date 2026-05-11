# Przegląd kodu — system-obiadow

Data: 2026-05-11
Zakres: cały folder `src/` + konfiguracja (`package.json`, `next.config.mjs`, `layout.js`, `middleware`).

Stos: Next.js 16 (App Router) + React 19 + Supabase JS 2.105 + Tailwind 4. Brak TypeScript, brak middleware, brak warstwy serwerowej dla wrażliwych operacji.

Uwagi posortowane od najgroźniejszych do kosmetycznych.

---

## 🔴 TIER 1 — KRYTYCZNE (do naprawy zanim cokolwiek pójdzie produkcyjnie)

### 1. `/admin` nie ma żadnej kontroli dostępu
`src/app/admin/page.js` — komponent kliencki, brak sprawdzenia roli, brak sprawdzenia sesji. Po wpisaniu URL **dowolny zalogowany (a nawet niezalogowany) użytkownik** może:
- pobrać listę wszystkich profili (imię + nazwisko + company_id),
- pobrać listę wszystkich firm,
- **przepisać dowolnego pracownika do dowolnej firmy** — to eskalacja uprawnień.

Z opisu sugerujesz, że są role (`role` w `profiles`), ale w kodzie nie ma żadnego `if (profile.role !== 'admin')`. Jeśli polegasz wyłącznie na RLS w Supabase, sprawdź konfigurację RLS na tabeli `profiles` — domyślnie po włączeniu RLS bez polityk każdy ANON dostaje pustkę, ale jeżeli masz politykę typu `SELECT … USING (true)` to wycieka cała baza.

**Fix:**
- dodać sprawdzenie roli na początku komponentu (przekierowanie jeśli `role !== 'admin'`),
- dodać `middleware.ts` w root projektu i odciąć `/admin/*` na poziomie edge,
- w RLS dodać polityki: `SELECT` na `profiles` tylko własnego wiersza lub `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')`,
- to samo dla `UPDATE` na `profiles.company_id`.

### 2. `/restauracja` nie ma żadnej kontroli dostępu
Identyczny problem co w #1, mimo że w opisie wspominasz: „wpuszcza tylko użytkowników z `role === 'restaurant'`". W `src/app/restauracja/page.js` nie ma ani jednego `if (role === 'restaurant')`. Dowolny user może:
- dodać/usunąć danie z menu (i ustawić cenę!),
- zobaczyć imiona i nazwiska wszystkich klientów oraz ich zamówienia,
- zobaczyć recenzje z personaliami.

**Fix:** to samo co w #1 plus polityki RLS na `menu_items` (INSERT/DELETE/UPDATE tylko dla roli `restaurant`).

### 3. `/kuchnia` — server component bez sprawdzenia sesji
`src/app/kuchnia/page.js` używa klienta z `NEXT_PUBLIC_SUPABASE_ANON_KEY` po stronie serwera. To znaczy, że:
- każde uderzenie tej trasy ujawnia listę dzisiejszych zamówień (z nazwiskami przez relację, gdy ją dodasz),
- nie ma `await supabase.auth.getUser()`,
- klient anon nie ma „sesji" w SSR – żeby autoryzacja działała, musisz użyć `@supabase/ssr` z cookies (`createServerClient`).

**Fix:** przepisać na `@supabase/ssr`, dodać guard roli `restaurant`. Najlepiej w `app/(protected)/...` z `layout.js`, który robi `redirect('/login')` przy braku sesji.

### 4. Manipulacja zamówieniem po stronie klienta (krytyczna luka w domenie e-commerce)
W `MenuCart.js` insert do `orders` idzie **bezpośrednio z przeglądarki** z polami, którymi w ogóle nie powinien zarządzać klient:

```js
await supabase.from('orders').insert([{
  profile_id: userId,
  total_price: totalAmount,                       // ⚠️ liczone w przeglądarce
  employer_paid: Math.min(totalAmount, subsidy),  // ⚠️ subsidy z profilu klienta
  employee_paid: toPay,                           // ⚠️ liczone w przeglądarce
  status: 'approved'                              // ⚠️ klient sam ustawia status
}]);
```

Przy włączonej polityce RLS „insert by own profile_id" użytkownik wciąż może w devtools wpisać:
- `total_price: 1`, `employee_paid: 0` → zamówienie obiadu za grosze,
- `status: 'paid_via_blik'` → zamówienie z „opłaconym" BLIK-iem bez wpisywania kodu,
- `price_at_time: 0.01` w `order_items` — Twoje raporty kuchenne dalej pokażą danie, a księgowość zobaczy darmochę.

**Fix (kierunkowy):**
1. Wszystkie ceny i kwoty musi naliczać Postgres (RPC `create_order(payload jsonb)` jako `security definer`), który:
   - waliduje, że `menu_item_id` istnieje, że `available_date` zgadza się z `delivery_date`, że `shift in (1,2)`,
   - liczy `total_price`, `employer_paid` (z `companies.daily_subsidy`), `employee_paid`,
   - ustawia `status = 'approved'` lub `'pending_payment'` w zależności od modelu firmy,
   - wstawia `orders` + `order_items` atomowo w transakcji.
2. Polityki RLS na `orders`: `INSERT` zablokowany dla `anon` i `authenticated` — tylko przez funkcję.
3. Pola jak `status`, `employer_paid`, `employee_paid` mają być **niemodyfikowalne** dla użytkownika (RLS na UPDATE z `WITH CHECK` ograniczające które kolumny można zmienić — w Postgresie zwykle przez trigger BEFORE UPDATE).

### 5. „Płatność BLIK" jest fałszywa (z opisu wynika, że istnieje — w kodzie jej nie ma)
W opisie piszesz, że wpisuje się 6-cyfrowy kod BLIK i status zmienia się na `paid_via_blik`. W kodzie `MenuCart.js` nie ma żadnego modala BLIK ani żadnej logiki płatności — jest tylko `status: 'approved'`. Nawet gdyby modal był, **6-cyfrowy kod wpisywany u Ciebie to nie jest płatność** — to tylko ciąg cyfr. Klient może pominąć krok, wpisać 000000, czy bilet teatralny.

**Fix:**
- zintegruj prawdziwą bramkę (Przelewy24/PayU/Stripe z BLIK on-session, Tpay) — operator dostarcza webhook potwierdzający transakcję,
- status `paid_via_blik` ustawia **wyłącznie webhook** po stronie serwera (Edge Function lub Next API route z weryfikacją podpisu HMAC od bramki),
- klient nigdy nie pisze do `status`.

### 6. Wstawianie profilu po stronie klienta przy rejestracji
`src/app/login/page.js` po `auth.signUp` wykonuje ręczny `insert` do `profiles`:
- jeśli użytkownik zamknie kartę między `signUp` a `insert`, masz osierocony rekord w `auth.users` bez `profiles`,
- jeśli e-mail confirmation jest włączone, `data.user` istnieje, ale brak sesji → insert się wywali na RLS,
- to też wymaga polityki INSERT na `profiles` dla `anon`, co potencjalnie pozwala spamować bazę.

**Fix:** trigger w Postgres `after insert on auth.users → insert into public.profiles (id, …)`. Wtedy aplikacja w ogóle nie tyka tej tabeli przy signupie.

---

## 🟠 TIER 2 — WYSOKIE (błędy logiczne, błędy produkcyjne, słabe DX)

### 7. Strefa czasowa w kalendarzu
W `MenuCart.js` i `restauracja/page.js`:
```js
d.toISOString().split('T')[0]
```
zwraca datę w **UTC**, a nie w Europe/Warsaw. Po ~23:00 lokalnego czasu pracownik zobaczy „jutro" jako „Dziś". To samo wpływa na filtr `available_date === selectedDate` — można zgubić cały dzień menu.

**Fix:** `new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d)` (zwraca format `YYYY-MM-DD`) albo użyj `date-fns-tz`/`luxon`.

### 8. Możliwy bug porównania ID w koszyku
`addToCart(id)` zapisuje pod kluczem `cart[id]`. JS w obiektach zawsze koercjuje klucze do stringów. Później:
```js
filteredItems.find(i => i.id === itemId).price
```
Jeżeli `menu_items.id` to liczba `bigint`/`int`, `i.id === itemId` to `123 === "123"` → `false`, `.price` → `TypeError`. Jeżeli `uuid` (default Supabase), wszystko gra. Sprawdź typ kolumny — jeśli numeryczna, zmień na `Number(itemId)` lub trzymaj cart jako `Map`.

### 9. Brak walidacji zmiany (shift)
`selectedShift` może być wszystkim z `[1,2]` (UI), ale przez DevTools możesz wstawić `999`. Brak constraintu w bazie (`CHECK (shift IN (1,2))`).

### 10. `MenuCart` ściąga **całe** menu i filtruje w przeglądarce
```js
supabase.from('menu_items').select('*')
```
Po roku użytkowania serwer wypluwa wszystkie pozycje historyczne za każdym razem. Powinno być:
```js
.select('*')
.gte('available_date', today)
.lte('available_date', plus7Days)
```
Albo zachowywać w cache (React Query / SWR / Server Component z `revalidate`).

### 11. `restauracja` rozwija detalizację na N kopii
```js
for (let i = 0; i < qty; i++) detailedList.push({...})
```
Zamówienie 50 x kawy → 50 obiektów w stanie. Działa, ale niepotrzebne. Trzymaj `qty` w obiekcie, a do druku naklejek rozwijaj dopiero w komponencie naklejek.

### 12. Brak refetch / realtime po zmianach
Po dodaniu dania `fetchRestaurantData()` przeładowuje wszystko (menu + opinie). Lepiej:
- Supabase Realtime na `menu_items`/`orders` → automatyczne odświeżenie,
- albo optimistic update + pojedynczy refresh tej części.

### 13. `window.location.href = '/login'` zamiast `router.push`
W kilku miejscach robisz hard reload. To traci stan Reacta, lekko miga ekran, jest wolne i niesie ze sobą koszt SSR. Wszędzie używaj:
```js
import { useRouter } from 'next/navigation';
const router = useRouter();
router.replace('/login');
```

### 14. Linki `<a href>` zamiast `<Link>`
W `page.js`, `historia/page.js`, `restauracja/page.js`. `<a>` w App Routerze powoduje pełne nawigacje (utrata stanu, koszt sieciowy). Zamień na `import Link from 'next/link'`.

### 15. Ignorowane błędy z Supabase
Praktycznie wszędzie:
```js
const { data } = await supabase.from(...)...;
```
Bez `error`. Gdy RLS zablokuje, gdy sieć padnie, gdy schemat się zmieni — user zobaczy pusty stan i nie zrozumie, że coś jest źle. Wszędzie obsłuż `error` (toast, log, sentry).

### 16. `alert()` jako warstwa komunikatów
Brzydkie, blokujące, na mobile irytujące. Wprowadź `sonner`/`react-hot-toast` lub własny mały `Toast` w `layout.js`.

### 17. `manifest.js` wskazuje na `/icon.png`, ale plik nie istnieje
Sprawdziłem `/public` — masz tam svgs, brak `icon.png`. PWA się nie zainstaluje na Androidzie. Dodaj plik 512x512.

### 18. `userScalable: false` + `maximumScale: 1`
W `layout.js`. To narusza WCAG 1.4.4 (Resize text). Słabe pod kątem dostępności i jest ostrzegane przez Lighthouse. W obecnej formie najczęściej zostawia się to dla apek-podobnych, ale świadomie.

### 19. Ceny jako float
`numeric` w Postgresie jest OK, ale jeśli w schemacie masz `double precision` / `real`, miej świadomość zaokrągleń. W obiegu pieniężnym standardem jest `numeric(10,2)` lub liczby całkowite w groszach.

---

## 🟡 TIER 3 — ŚREDNIE (refactor, czystość)

### 20. Brak TypeScriptu
Projekt szybko się rozrasta i zaczynają się literówki w nazwach kolumn (`first_name` vs `firstName`). Supabase ma `supabase gen types typescript` — wygeneruj typy schematu i przepiąć projekt na TS. To pojedyncza najlepsza inwestycja DX.

### 21. Duplikacja paska kalendarza
Identyczna pętla generująca 7 dni w `MenuCart.js` i `restauracja/page.js`. Wyciągnij do `hooks/useUpcomingDays.js` (zwraca `days[]` i bierze `timeZone`).

### 22. Brak `middleware.ts`
Globalna ochrona tras `/admin`, `/restauracja`, `/kuchnia`, `/historia` w jednym pliku, z użyciem `@supabase/ssr`. Wzór jest w dokumentacji Supabase „Auth Helpers / SSR".

### 23. Brak segmentu `(protected)` z layoutem
W App Routerze ergonomicznie wygląda:
```
app/
  (public)/login/page.js
  (protected)/
    layout.js          ← guard sesji
    page.js            ← /
    historia/page.js
    admin/
      layout.js        ← guard roli admin
      page.js
    restauracja/
      layout.js        ← guard roli restaurant
      page.js
```

### 24. `print:` styles w środku JSX + tag `<style>` w trakcie renderu
Dla naklejek wstawiasz `<style>{`@page ...`}</style>` w komponencie. Działa, ale Next ostrzega przed niestandardowymi `<style>` w client component. Lepiej:
- `globals.css` z sekcją `@media print { ... }`,
- albo `app/restauracja/print.css` importowane w layout.

### 25. Trigger drukowania przez `setTimeout(window.print, 100)`
Fragile. Czasem React jeszcze nie wyrenderuje, czasem zdąży. Niezawodne podejście:
```js
useEffect(() => {
  if (shouldPrint) {
    window.print();
    setShouldPrint(false);
  }
}, [shouldPrint, printMode]);
```
gdzie `shouldPrint` ustawiasz po pełnym przerenderowaniu w nowym `printMode`.

### 26. Brak deadline'u zamówień (cutoff)
Pracownik może 30 minut przed dostawą zamówić obiad. Dodaj kolumnę `orders_cutoff_time` w `companies` (lub w `menu_items`) i blokuj po stronie RPC + UI.

### 27. Status zamówienia jest ubogi
`'approved' | 'paid_via_blik'`. Brakuje:
- `pending_payment` (BLIK czeka),
- `cancelled` (anulowane),
- `delivered` (dostarczone — wpływa na ratingi),
- `refunded`.

### 28. Brak limitu porcji
Jak kuchnia ma 50 schabowych, każdy może zamówić ile chce. Dodaj `menu_items.max_qty` i sprawdzaj w RPC z `FOR UPDATE` na wierszu, żeby uniknąć wyścigu.

### 29. Brak audyt-logu
Komu kucharz zmienił cenę, kiedy admin przepisał użytkownika do firmy — żadne ślady. Tabela `audit_log(actor_id, entity, entity_id, action, payload, created_at)` ratuje życie przy reklamacjach.

### 30. Brak komponentów współdzielonych
`components/` ma tylko `MenuCart.js`. Wyciągnij `<DayPicker>`, `<ShiftPicker>`, `<EmptyState>`, `<Loader>` — w panelu restauracji są te same wzorce.

### 31. Wstawianie zamówienia bez `await` na drugim insertcie
W `submitOrder` jest `await supabase.from('order_items').insert(orderItemsData);` — ale błąd jest ignorowany. Jeśli się wywali (np. RLS), zamówienie nadrzędne istnieje, a items nie. Powinna być transakcja (znowu: zamknij to w RPC).

### 32. Brak `email_verified`/`onboarding_state`
Jeżeli SaaS, zwykle do panelu można dopiero po potwierdzeniu maila i przypisaniu firmy. Teraz `page.js` po prostu pokazuje „Oczekiwanie na przypisanie do firmy…" — to wystarcza, ale do wzbogacenia: ekran z instrukcją „skontaktuj się z opiekunem konta".

### 33. Brak strony 404 / loading / error
Nie widzę `not-found.js`, `loading.js`, `error.js`. Next App Router je oczekuje — daj nawet minimalne, ładne wersje.

### 34. README nieaktualne
README to chyba domyślny szablon Next.js. Zaktualizuj: opis projektu, jak uruchomić, jakie `.env` są potrzebne, jak rolować migracje Supabase.

---

## 🟢 TIER 4 — KOSMETYKA / NICE-TO-HAVE

### 35. Brak walidacji środowiska
`supabase.js` zakłada, że ENV jest. Dodaj na górze:
```js
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
```

### 36. Brak konfiguracji Prettier i hooków pre-commit (Husky/lefthook).

### 37. Brak `@/*` w importach — `jsconfig.json` ma alias ale używasz `'../lib/supabase'`. Spójność.

### 38. Brak `eslint-plugin-jsx-a11y` — sporo przycisków bez `aria-label` (zwłaszcza ikoniczne „X" przy wylogowaniu).

### 39. Druk: zostawiasz `border: 1px dashed #ccc` na naklejkach — to świadomy ułatwiacz przy cięciu, OK; ale dorzuć w UI checkbox „bez znaczników cięcia".

### 40. Anonimowość ocen
Pokazujesz w panelu restauracji `first_name + last_name` autora recenzji. Pomyśl, czy to zgodne z Twoim modelem produktowym; opcja „anonimowo" jest standardem (i ułatwia GDPR).

### 41. Reviewy bez powiązania z `delivery_date`
Pracownik może zostawić rating na `order_items.id`, ale rating jest globalny dla pozycji, nie dla dania. Jeśli to samo danie wraca, możesz mieć wiele ratingów per `order_item`. Lepsza struktura: tabela `dish_reviews(dish_id, profile_id, rating, text, created_at)`.

### 42. Brak `revalidate` / kierunek cache
`kuchnia/page.js` ma `dynamic = 'force-dynamic'`. Dobrze, ale rozważ `revalidate = 30` z odświeżeniem zamiast w pełni dynamicznego renderu — odciążysz Supabase.

### 43. .DS_Store w repo
Widzę w `src/.DS_Store` i `src/app/.DS_Store`. `.gitignore` ma `.DS_Store`, ale prawdopodobnie zostały dodane wcześniej. `git rm --cached src/.DS_Store src/app/.DS_Store`.

---

## ✅ REKOMENDOWANE NEXT STEPS (kolejność)

1. **Włącz/audytuj RLS na każdej tabeli** (`profiles`, `companies`, `menu_items`, `orders`, `order_items`) — bez tego anon key w przeglądarce = otwarta baza. Zrób eksport polityk (`supabase db dump --schema=public`) i prześlij, zweryfikujemy.
2. **Dopisz `middleware.ts` + segment `(protected)`** w App Routerze; przepisz pages na `@supabase/ssr`.
3. **Przenieś tworzenie zamówienia do RPC `security definer`** — z walidacją cen, statusu, subsydium, deadline'u.
4. **Wstaw guarda roli** w `/admin` (`role='admin'`) i `/restauracja` (`role='restaurant'`).
5. **Trigger po `auth.users` → `profiles`** — wycofaj insert klientowy.
6. **TypeScript + typy ze schematu Supabase**.
7. **Zintegruj realną bramkę BLIK + webhook** zmieniający status.
8. Reszta (UI, refactor komponentów, kalendarz w hooku, toasty, PWA icon, README) — po stabilizacji bazy.

Jeśli chcesz, mogę:
- napisać szkielet `middleware.ts` i layout `(protected)` z guardem roli,
- napisać szablon polityk RLS dla każdej tabeli (SQL gotowe do wklejenia w Supabase),
- napisać RPC `create_order` w SQL razem z walidacjami i triggerem `before update` zamykającym pola finansowe.

Powiedz tylko, od czego zaczynamy.
