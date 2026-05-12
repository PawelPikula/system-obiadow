-- ============================================================
-- 0005_menu_item_limits.sql
-- Dodanie limitów porcji dla dań w menu
-- ============================================================

-- 1. Dodanie kolumny max_quantity
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS max_quantity integer;

-- 2. Aktualizacja RPC create_order
-- Sprawdzamy czy nie przekroczono dostępności dań.
CREATE OR REPLACE FUNCTION public.create_order(
  p_delivery_date date,
  p_shift integer,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item record;
  v_menu_item_id uuid;
  v_quantity integer;
  v_price numeric;
  v_total_price numeric := 0;
  v_subsidy numeric;
  v_employer_paid numeric := 0;
  v_employee_paid numeric := 0;
  v_profile_id uuid := auth.uid();
  v_company_id uuid;
  v_ordered_today integer;
  v_max_qty integer;
  v_current_sold integer;
BEGIN
  -- 1. Sprawdź czy użytkownik jest zalogowany
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Użytkownik nie jest zalogowany.';
  END IF;

  -- 2. Sprawdź czy użytkownik ma już zamówienie na ten dzień i zmianę
  SELECT COUNT(*) INTO v_ordered_today
  FROM public.orders
  WHERE profile_id = v_profile_id
    AND delivery_date = p_delivery_date
    AND shift = p_shift
    AND status NOT IN ('cancelled', 'refunded');

  IF v_ordered_today > 0 THEN
    RAISE EXCEPTION 'Masz już aktywne zamówienie na tę zmianę (% . %)', p_delivery_date, p_shift;
  END IF;

  -- 3. Pobierz dane firmy użytkownika dla dofinansowania
  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_profile_id;
  IF v_company_id IS NOT NULL THEN
    SELECT daily_subsidy INTO v_subsidy FROM public.companies WHERE id = v_company_id;
  END IF;
  v_subsidy := COALESCE(v_subsidy, 0);

  -- Jeśli weekend, brak dofinansowania
  IF EXTRACT(DOW FROM p_delivery_date) IN (0, 6) THEN
    v_subsidy := 0;
  END IF;

  -- Jeśli już użyto dofinansowania tego dnia w innej zmianie
  IF v_subsidy > 0 THEN
    SELECT COUNT(*) INTO v_ordered_today
    FROM public.orders
    WHERE profile_id = v_profile_id
      AND delivery_date = p_delivery_date
      AND employer_paid > 0
      AND status NOT IN ('cancelled', 'refunded');
    
    IF v_ordered_today > 0 THEN
      v_subsidy := 0;
    END IF;
  END IF;

  -- 4. Utwórz nagłówek zamówienia (status approved domyślnie, lub płatność?)
  -- Na potrzeby tego systemu przyjmujemy 'approved' dla modelu salary_deduction.
  INSERT INTO public.orders (profile_id, delivery_date, shift, status, total_price, employer_paid, employee_paid)
  VALUES (v_profile_id, p_delivery_date, p_shift, 'approved', 0, 0, 0)
  RETURNING id INTO v_order_id;

  -- 5. Przetwórz pozycje zamówienia
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(menu_item_id uuid, quantity integer)
  LOOP
    -- Pobierz aktualną cenę i limit
    SELECT price, max_quantity INTO v_price, v_max_qty 
    FROM public.menu_items 
    WHERE id = v_item.menu_item_id;

    IF v_price IS NULL THEN
      RAISE EXCEPTION 'Nie znaleziono dania o ID %', v_item.menu_item_id;
    END IF;

    -- Sprawdź dostępność (limit)
    IF v_max_qty IS NOT NULL THEN
       SELECT COALESCE(SUM(quantity), 0) INTO v_current_sold
       FROM public.order_items oi
       JOIN public.orders o ON oi.order_id = o.id
       WHERE oi.menu_item_id = v_item.menu_item_id
         AND o.status NOT IN ('cancelled', 'refunded');

       IF v_current_sold + v_item.quantity > v_max_qty THEN
         RAISE EXCEPTION 'Przepraszamy, danie zostało wyprzedane (dostępne: %)', v_max_qty - v_current_sold;
       END IF;
    END IF;

    INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time)
    VALUES (v_order_id, v_item.menu_item_id, v_item.quantity, v_price);

    v_total_price := v_total_price + (v_price * v_item.quantity);
  END LOOP;

  -- 6. Oblicz podział płatności
  v_employer_paid := LEAST(v_total_price, v_subsidy);
  v_employee_paid := v_total_price - v_employer_paid;

  -- 7. Zaktualizuj nagłówek zamówienia
  UPDATE public.orders
  SET total_price = v_total_price,
      employer_paid = v_employer_paid,
      employee_paid = v_employee_paid
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;
