-- ============================================================
-- system-obiadow — krok 3: RPC create_order
--
-- Po tym pliku składanie zamówień odbywa się WYŁĄCZNIE przez funkcję
-- public.create_order(...). RLS z kroku 1 nadal blokuje bezpośredni INSERT
-- do orders/order_items z klienta — i tak ma być.
--
-- Funkcja:
--   - waliduje sesję, datę dostawy, zmianę, pozycje koszyka,
--   - liczy total_price ze schematu (a nie z przeglądarki),
--   - liczy employer_paid uwzględniając już wykorzystane dofinansowanie
--     na ten sam delivery_date (subsidy budget — nie da się złożyć 10 zamówień
--     po 1 zł, każde z dofinansowaniem 1 zł),
--   - dobiera status na podstawie payment_model firmy,
--   - wstawia orders + order_items w jednej transakcji.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_order(
  p_delivery_date date,
  p_shift         smallint,
  p_items         jsonb   -- [{"menu_item_id": "...", "quantity": 1}, ...]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid               uuid := auth.uid();
  v_today             date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  v_company_id        uuid;
  v_payment_model     text;
  v_daily_subsidy     numeric := 0;
  v_subsidy_used      numeric := 0;
  v_subsidy_remaining numeric := 0;
  v_total_price       numeric := 0;
  v_employer_paid     numeric;
  v_employee_paid     numeric;
  v_status            text;
  v_order_id          uuid;
  v_item              jsonb;
  v_qty               int;
  v_mi_id_text        text;
  v_mi_price          numeric;
  v_mi_name           text;
  v_mi_available_date date;
BEGIN
  -- ---- sesja ----------------------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Brak sesji. Zaloguj się ponownie.' USING ERRCODE = '28000';
  END IF;

  -- ---- argumenty -------------------------------------------------------
  IF p_delivery_date IS NULL OR p_delivery_date < v_today THEN
    RAISE EXCEPTION 'Data dostawy nie może być w przeszłości.'
      USING ERRCODE = '22023';
  END IF;

  IF p_shift IS NULL OR p_shift NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Zmiana musi być 1 albo 2.' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Koszyk jest pusty.' USING ERRCODE = '22023';
  END IF;

  -- ---- profil + firma -------------------------------------------------
  SELECT p.company_id, c.payment_model, COALESCE(c.daily_subsidy, 0)
    INTO v_company_id, v_payment_model, v_daily_subsidy
    FROM profiles p
    LEFT JOIN companies c ON c.id = p.company_id
   WHERE p.id = v_uid;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Twoje konto nie ma jeszcze przypisanej firmy.'
      USING ERRCODE = '23514';
  END IF;

  -- ---- ile dofinansowania już zużyte na ten dzień ---------------------
  SELECT COALESCE(SUM(employer_paid), 0)
    INTO v_subsidy_used
    FROM orders
   WHERE profile_id = v_uid
     AND delivery_date = p_delivery_date
     AND status NOT IN ('cancelled', 'refunded');

  v_subsidy_remaining := GREATEST(v_daily_subsidy - v_subsidy_used, 0);

  -- ---- walidacja pozycji + zliczanie totalu ---------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := NULLIF(v_item ->> 'quantity', '')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Nieprawidłowa ilość w koszyku.'
        USING ERRCODE = '22023';
    END IF;

    v_mi_id_text := v_item ->> 'menu_item_id';
    IF v_mi_id_text IS NULL OR length(v_mi_id_text) = 0 THEN
      RAISE EXCEPTION 'Brak identyfikatora dania.' USING ERRCODE = '22023';
    END IF;

    -- id porównujemy jako text — dzięki temu RPC działa zarówno przy
    -- menu_items.id typu uuid, bigint, jak i int.
    SELECT id::text, price, name, available_date
      INTO v_mi_id_text, v_mi_price, v_mi_name, v_mi_available_date
      FROM menu_items
     WHERE id::text = v_mi_id_text;

    IF v_mi_id_text IS NULL THEN
      RAISE EXCEPTION 'Wybrane danie nie istnieje.'
        USING ERRCODE = '23503';
    END IF;

    IF v_mi_available_date IS DISTINCT FROM p_delivery_date THEN
      RAISE EXCEPTION 'Danie "%" nie jest dostępne na %.',
        v_mi_name, p_delivery_date USING ERRCODE = '22023';
    END IF;

    v_total_price := v_total_price + v_mi_price * v_qty;
  END LOOP;

  IF v_total_price <= 0 THEN
    RAISE EXCEPTION 'Wartość zamówienia musi być większa od zera.'
      USING ERRCODE = '22023';
  END IF;

  -- ---- naliczanie kwot ------------------------------------------------
  v_employer_paid := LEAST(v_total_price, v_subsidy_remaining);
  v_employee_paid := v_total_price - v_employer_paid;

  -- ---- status zamówienia ---------------------------------------------
  IF v_employee_paid = 0 THEN
    v_status := 'approved';
  ELSIF v_payment_model = 'salary_deduction' THEN
    v_status := 'approved';
  ELSIF v_payment_model = 'blik' THEN
    -- czeka na webhook od bramki (krok 4 — prawdziwa integracja)
    v_status := 'pending_payment';
  ELSE
    v_status := 'pending_payment';
  END IF;

  -- ---- insert order ---------------------------------------------------
  INSERT INTO orders (
    profile_id, order_date, delivery_date, shift,
    total_price, employer_paid, employee_paid, status
  )
  VALUES (
    v_uid, v_today, p_delivery_date, p_shift,
    v_total_price, v_employer_paid, v_employee_paid, v_status
  )
  RETURNING id INTO v_order_id;

  -- ---- insert order_items (cena bierze się z bazy, nie z klienta) -----
  INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_time)
  SELECT v_order_id,
         mi.id,
         (item ->> 'quantity')::int,
         mi.price
    FROM jsonb_array_elements(p_items) AS item
    JOIN menu_items mi ON mi.id::text = (item ->> 'menu_item_id');

  RETURN v_order_id;
END;
$$;

-- Anon nie wywołuje. Authenticated tak.
REVOKE ALL ON FUNCTION public.create_order(date, smallint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(date, smallint, jsonb) TO authenticated;


-- ============================================================
-- TESTY MANUALNE (Supabase SQL Editor jako Twój zalogowany user)
-- ============================================================
--
-- 1. Pusty koszyk:
--      SELECT public.create_order(CURRENT_DATE, 1::smallint, '[]'::jsonb);
--    → ERROR "Koszyk jest pusty."
--
-- 2. Złe ID dania:
--      SELECT public.create_order(CURRENT_DATE, 1::smallint,
--        '[{"menu_item_id":"00000000-0000-0000-0000-000000000000","quantity":1}]'::jsonb);
--    → ERROR "Wybrane danie nie istnieje."
--
-- 3. Poprawne zamówienie (podstaw id istniejącego menu_items na dzisiaj):
--      SELECT public.create_order(CURRENT_DATE, 1::smallint,
--        '[{"menu_item_id":"<ID>","quantity":2}]'::jsonb);
--    → zwraca uuid orderu; SELECT * FROM orders WHERE id = '...';
--      powinno mieć poprawnie naliczone total_price/employer_paid/employee_paid.
-- ============================================================
