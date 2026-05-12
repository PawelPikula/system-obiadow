-- ============================================================
-- 0007_stability_and_performance.sql
-- Fix wyścigów, deadline'ów i wydajności raportów.
-- ============================================================

-- 1. Poprawka create_order (Race Condition + Deadline)
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
  v_settings record;
  v_cutoff_time time;
  v_cutoff_prev_day boolean;
  v_deadline timestamptz;
  v_now timestamptz := now();
BEGIN
  -- 1. Sprawdź czy użytkownik jest zalogowany
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Użytkownik nie jest zalogowany.';
  END IF;

  -- 2. Walidacja DEADLINE (Godzina brzegowa)
  SELECT * INTO v_settings FROM public.system_settings WHERE id = 1;
  IF p_shift = 1 THEN
    v_cutoff_time := v_settings.order_cutoff_shift1;
    v_cutoff_prev_day := v_settings.order_cutoff_shift1_prev_day;
  ELSE
    v_cutoff_time := v_settings.order_cutoff_shift2;
    v_cutoff_prev_day := v_settings.order_cutoff_shift2_prev_day;
  END IF;

  -- Oblicz deadline w czasie Europe/Warsaw
  v_deadline := (p_delivery_date::text || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE 'Europe/Warsaw';
  IF v_cutoff_prev_day THEN
    v_deadline := v_deadline - interval '1 day';
  END IF;

  IF v_now > v_deadline THEN
    RAISE EXCEPTION 'Termin składania zamówień na ten dzień i zmianę już minął (%)', v_deadline AT TIME ZONE 'Europe/Warsaw';
  END IF;

  -- 3. Sprawdź czy użytkownik ma już zamówienie
  SELECT COUNT(*) INTO v_ordered_today
  FROM public.orders
  WHERE profile_id = v_profile_id
    AND delivery_date = p_delivery_date
    AND shift = p_shift
    AND status NOT IN ('cancelled', 'refunded');

  IF v_ordered_today > 0 THEN
    RAISE EXCEPTION 'Masz już aktywne zamówienie na tę zmianę (% . %)', p_delivery_date, p_shift;
  END IF;

  -- 4. Pobierz dane firmy i dofinansowanie
  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_profile_id;
  IF v_company_id IS NOT NULL THEN
    SELECT daily_subsidy INTO v_subsidy FROM public.companies WHERE id = v_company_id;
  END IF;
  v_subsidy := COALESCE(v_subsidy, 0);

  IF EXTRACT(DOW FROM p_delivery_date) IN (0, 6) THEN
    v_subsidy := 0;
  END IF;

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

  -- 5. Utwórz nagłówek
  INSERT INTO public.orders (profile_id, delivery_date, shift, status, total_price, employer_paid, employee_paid)
  VALUES (v_profile_id, p_delivery_date, p_shift, 'approved', 0, 0, 0)
  RETURNING id INTO v_order_id;

  -- 6. Przetwórz pozycje (FOR UPDATE zapobiega Race Condition)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(menu_item_id uuid, quantity integer)
  LOOP
    -- Blokujemy wiersz menu_item do końca transakcji
    SELECT price, max_quantity INTO v_price, v_max_qty 
    FROM public.menu_items 
    WHERE id = v_item.menu_item_id
    FOR UPDATE;

    IF v_price IS NULL THEN
      RAISE EXCEPTION 'Nie znaleziono dania o ID %', v_item.menu_item_id;
    END IF;

    IF v_max_qty IS NOT NULL THEN
       SELECT COALESCE(SUM(quantity), 0) INTO v_current_sold
       FROM public.order_items oi
       JOIN public.orders o ON oi.order_id = o.id
       WHERE oi.menu_item_id = v_item.menu_item_id
         AND o.status NOT IN ('cancelled', 'refunded');

       IF v_current_sold + v_item.quantity > v_max_qty THEN
         RAISE EXCEPTION 'Danie właśnie się wyprzedało lub brakuje porcji (dostępne: %)', GREATEST(0, v_max_qty - v_current_sold);
       END IF;
    END IF;

    INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time)
    VALUES (v_order_id, v_item.menu_item_id, v_item.quantity, v_price);

    v_total_price := v_total_price + (v_price * v_item.quantity);
  END LOOP;

  v_employer_paid := LEAST(v_total_price, v_subsidy);
  v_employee_paid := v_total_price - v_employer_paid;

  UPDATE public.orders
  SET total_price = v_total_price,
      employer_paid = v_employer_paid,
      employee_paid = v_employee_paid
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;


-- 2. RLS dla anulowania zamówień (Pracownik może anulować swoje)
DROP POLICY IF EXISTS "orders_update_owner_cancel" ON public.orders;
CREATE POLICY "orders_update_owner_cancel"
ON public.orders FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (
  profile_id = auth.uid() 
  AND status = 'cancelled' -- Pracownik może TYLKO anulować
);

-- 3. Trigger sprawdzający DEADLINE anulowania
CREATE OR REPLACE FUNCTION public.validate_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_cutoff_time time;
  v_cutoff_prev_day boolean;
  v_deadline timestamptz;
  v_now timestamptz := now();
BEGIN
  -- Jeśli to nie jest zmiana na 'cancelled', nic nie rób (obsługiwane przez RLS dla innych ról)
  IF NEW.status IS DISTINCT FROM 'cancelled' THEN
     RETURN NEW;
  END IF;

  -- Admin i restauracja mogą anulować zawsze
  IF public.is_restaurant() THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_settings FROM public.system_settings WHERE id = 1;
  
  IF OLD.shift = 1 THEN
    v_cutoff_time := v_settings.cancel_cutoff_shift1;
    v_cutoff_prev_day := v_settings.cancel_cutoff_shift1_prev_day;
  ELSE
    v_cutoff_time := v_settings.cancel_cutoff_shift2;
    v_cutoff_prev_day := v_settings.cancel_cutoff_shift2_prev_day;
  END IF;

  v_deadline := (OLD.delivery_date::text || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE 'Europe/Warsaw';
  IF v_cutoff_prev_day THEN
    v_deadline := v_deadline - interval '1 day';
  END IF;

  IF v_now > v_deadline THEN
    RAISE EXCEPTION 'Termin anulowania tego zamówienia minął (%)', v_deadline AT TIME ZONE 'Europe/Warsaw';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validate_order_cancellation ON public.orders;
CREATE TRIGGER tr_validate_order_cancellation
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE PROCEDURE public.validate_order_cancellation();


-- 4. Widok statystyk finansowych dla restauracji
CREATE OR REPLACE VIEW public.restaurant_financial_summary AS
SELECT 
  delivery_date,
  COUNT(id) as order_count,
  SUM(total_price) as gross_revenue,
  SUM(employer_paid) as gross_cost_employers,
  SUM(employee_paid) as gross_revenue_employees
FROM public.orders
WHERE status NOT IN ('cancelled', 'refunded')
GROUP BY delivery_date;

GRANT SELECT ON public.restaurant_financial_summary TO authenticated;

-- 5. RPC dla faktur (wysoka wydajność)
CREATE OR REPLACE FUNCTION public.get_invoice_summary(p_year_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_month_start date := (p_year_month || '-01')::date;
  v_month_end date := (v_month_start + interval '1 month' - interval '1 day')::date;
BEGIN
  SELECT jsonb_build_object(
    'order_count', COUNT(id),
    'revenue_gross', COALESCE(SUM(total_price), 0),
    'total_meals', COALESCE(SUM((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id)), 0),
    'companies', COALESCE((
       SELECT jsonb_agg(c) FROM (
         SELECT 
           comp.id,
           comp.name,
           SUM(o.employer_paid) as gross,
           SUM((SELECT SUM(quantity) FROM order_items WHERE order_id = o.id)) as meals
         FROM orders o
         JOIN profiles p ON o.profile_id = p.id
         JOIN companies comp ON p.company_id = comp.id
         WHERE o.delivery_date BETWEEN v_month_start AND v_month_end
           AND o.status NOT IN ('cancelled', 'refunded')
           AND o.employer_paid > 0
         GROUP BY comp.id, comp.name
       ) c
    ), '[]'::jsonb)
  ) INTO v_result
  FROM orders
  WHERE delivery_date BETWEEN v_month_start AND v_month_end
    AND status NOT IN ('cancelled', 'refunded');

  RETURN v_result;
END;
$$;

-- 6. RPC dla statystyk (wysoka wydajność)
CREATE OR REPLACE FUNCTION public.get_restaurant_stats(p_year_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_today date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  v_week_ago date := v_today - interval '7 days';
  v_month_start date := (p_year_month || '-01')::date;
  v_month_end date := (v_month_start + interval '1 month' - interval '1 day')::date;
BEGIN
  SELECT jsonb_build_object(
    'today', (
      SELECT jsonb_build_object('revenue', COALESCE(SUM(total_price), 0), 'count', COALESCE(SUM((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id)), 0))
      FROM orders WHERE delivery_date = v_today AND status NOT IN ('cancelled', 'refunded')
    ),
    'week', (
      SELECT jsonb_build_object('revenue', COALESCE(SUM(total_price), 0), 'count', COALESCE(SUM((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id)), 0))
      FROM orders WHERE delivery_date >= v_week_ago AND delivery_date <= v_today AND status NOT IN ('cancelled', 'refunded')
    ),
    'month', (
      SELECT jsonb_build_object('revenue', COALESCE(SUM(total_price), 0), 'count', COALESCE(SUM((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id)), 0))
      FROM orders WHERE delivery_date >= v_month_start AND delivery_date <= v_month_end AND status NOT IN ('cancelled', 'refunded')
    ),
    'top_dishes', COALESCE((
      SELECT jsonb_agg(td) FROM (
        SELECT mi.name, SUM(oi.quantity) as count
        FROM order_items oi
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.delivery_date >= v_month_start AND o.delivery_date <= v_month_end
          AND o.status NOT IN ('cancelled', 'refunded')
        GROUP BY mi.name
        ORDER BY count DESC
        LIMIT 10
      ) td
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
