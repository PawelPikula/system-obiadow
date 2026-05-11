-- ============================================================
-- system-obiadow — krok 1: RLS, helpery ról, trigger profilu
-- Plik idempotentny (DROP IF EXISTS / CREATE OR REPLACE) — można puszczać wielokrotnie.
-- Uruchom w Supabase → SQL Editor jako użytkownik postgres (domyślnie).
-- ============================================================


-- ============================================================
-- 0. Sanity: brakujące/luźne constrainty
-- ============================================================

-- Upewniamy się, że kolumna role istnieje w profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'employee';
  END IF;
END $$;

-- Dopuszczalne wartości role: employee / restaurant / admin
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('employee', 'restaurant', 'admin'));

-- shift musi być 1 albo 2
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shift_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_shift_check
  CHECK (shift IN (1, 2));

-- Dopuszczalne statusy zamówienia
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending_payment',
    'approved',
    'paid_via_blik',
    'cancelled',
    'delivered',
    'refunded'
  ));

-- rating 1..5 albo NULL
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_rating_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_rating_check
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);


-- ============================================================
-- 1. Helpery ról
--    SECURITY DEFINER — żeby same nie wpadły w rekurencję RLS na profiles.
--    Funkcje zwracają STABLE → wynik cache'owany w obrębie zapytania.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('restaurant', 'admin')
  );
$$;

-- Anon nie woła tych funkcji
REVOKE ALL ON FUNCTION public.current_role_name() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_restaurant()     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant()     TO authenticated;


-- ============================================================
-- 2. Auto-tworzenie profilu po rejestracji
--    Zastępuje ręczny insert w src/app/login/page.js.
--    first_name / last_name przekazujemy w options.data przy signUp().
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name',  ''),
    'employee'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ============================================================
-- 3. Trigger blokujący wrażliwe kolumny w profiles
--    (role, company_id) — zmienić może tylko admin.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lock_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Tylko administrator może zmienić rolę.';
    END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Tylko administrator może przepisać użytkownika do firmy.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_profile_columns_trigger ON public.profiles;
CREATE TRIGGER lock_profile_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.lock_profile_columns();


-- ============================================================
-- 4. Trigger blokujący wrażliwe kolumny w order_items
--    Klient zmienia tylko rating / review_text.
--    Restauracja zmienia tylko completed_qty.
--    Admin może wszystko.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lock_order_item_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin      boolean := public.is_admin();
  v_is_restaurant boolean := public.is_restaurant();
  v_is_owner      boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = NEW.order_id AND profile_id = auth.uid()
  ) INTO v_is_owner;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_is_restaurant THEN
    IF NEW.order_id      IS DISTINCT FROM OLD.order_id      OR
       NEW.menu_item_id  IS DISTINCT FROM OLD.menu_item_id  OR
       NEW.quantity      IS DISTINCT FROM OLD.quantity      OR
       NEW.price_at_time IS DISTINCT FROM OLD.price_at_time OR
       NEW.rating        IS DISTINCT FROM OLD.rating        OR
       NEW.review_text   IS DISTINCT FROM OLD.review_text   THEN
      RAISE EXCEPTION 'Restauracja może modyfikować tylko completed_qty.';
    END IF;
    RETURN NEW;
  END IF;

  IF v_is_owner THEN
    IF NEW.order_id      IS DISTINCT FROM OLD.order_id      OR
       NEW.menu_item_id  IS DISTINCT FROM OLD.menu_item_id  OR
       NEW.quantity      IS DISTINCT FROM OLD.quantity      OR
       NEW.price_at_time IS DISTINCT FROM OLD.price_at_time OR
       NEW.completed_qty IS DISTINCT FROM OLD.completed_qty THEN
      RAISE EXCEPTION 'Możesz zmieniać tylko swoją ocenę i komentarz.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Brak uprawnień do modyfikacji pozycji zamówienia.';
END;
$$;

DROP TRIGGER IF EXISTS lock_order_item_columns_trigger ON public.order_items;
CREATE TRIGGER lock_order_item_columns_trigger
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE PROCEDURE public.lock_order_item_columns();


-- ============================================================
-- 5. Włącz RLS na wszystkich tabelach
-- ============================================================

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 6. profiles — polityki
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_self_or_priv" ON public.profiles;
CREATE POLICY "profiles_select_self_or_priv"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_admin()
  OR public.is_restaurant()
);

-- Insert blokujemy z klienta — robi to trigger handle_new_user (SECURITY DEFINER omija RLS)
DROP POLICY IF EXISTS "profiles_insert_blocked" ON public.profiles;
CREATE POLICY "profiles_insert_blocked"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin"
ON public.profiles FOR UPDATE
TO authenticated
USING      (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());


-- ============================================================
-- 7. companies — polityki
-- ============================================================

DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select"
ON public.companies FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.is_restaurant()
  OR id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "companies_modify_admin" ON public.companies;
CREATE POLICY "companies_modify_admin"
ON public.companies FOR ALL
TO authenticated
USING      (public.is_admin())
WITH CHECK (public.is_admin());


-- ============================================================
-- 8. menu_items — polityki
-- ============================================================

DROP POLICY IF EXISTS "menu_items_select_all_auth" ON public.menu_items;
CREATE POLICY "menu_items_select_all_auth"
ON public.menu_items FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "menu_items_modify_restaurant" ON public.menu_items;
CREATE POLICY "menu_items_modify_restaurant"
ON public.menu_items FOR ALL
TO authenticated
USING      (public.is_restaurant())
WITH CHECK (public.is_restaurant());


-- ============================================================
-- 9. orders — polityki
--    INSERT/UPDATE z klienta są ZABLOKOWANE.
--    Wstawianie zamówienia zrobi RPC create_order w kroku 3.
--    Do czasu wdrożenia RPC obecny insert z MenuCart.js przestanie działać.
-- ============================================================

DROP POLICY IF EXISTS "orders_select_own_or_priv" ON public.orders;
CREATE POLICY "orders_select_own_or_priv"
ON public.orders FOR SELECT
TO authenticated
USING (
  profile_id = auth.uid()
  OR public.is_admin()
  OR public.is_restaurant()
);

DROP POLICY IF EXISTS "orders_insert_blocked" ON public.orders;
CREATE POLICY "orders_insert_blocked"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "orders_update_priv" ON public.orders;
CREATE POLICY "orders_update_priv"
ON public.orders FOR UPDATE
TO authenticated
USING      (public.is_admin() OR public.is_restaurant())
WITH CHECK (public.is_admin() OR public.is_restaurant());

DROP POLICY IF EXISTS "orders_delete_admin" ON public.orders;
CREATE POLICY "orders_delete_admin"
ON public.orders FOR DELETE
TO authenticated
USING (public.is_admin());


-- ============================================================
-- 10. order_items — polityki
--     INSERT blokowany (RPC), UPDATE warunkowy (trigger ogranicza kolumny).
-- ============================================================

DROP POLICY IF EXISTS "order_items_select_via_order" ON public.order_items;
CREATE POLICY "order_items_select_via_order"
ON public.order_items FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.is_restaurant()
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "order_items_insert_blocked" ON public.order_items;
CREATE POLICY "order_items_insert_blocked"
ON public.order_items FOR INSERT
TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
CREATE POLICY "order_items_update"
ON public.order_items FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR public.is_restaurant()
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.profile_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR public.is_restaurant()
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "order_items_delete_admin" ON public.order_items;
CREATE POLICY "order_items_delete_admin"
ON public.order_items FOR DELETE
TO authenticated
USING (public.is_admin());


-- ============================================================
-- 11. UWAGA — pierwszy admin
--     Po wdrożeniu tego pliku nikt nie jest adminem ani restauracją.
--     Wykonaj RĘCZNIE w SQL Editor (jako postgres) po raz pierwszy:
--
--       -- znajdź swój profil:
--       SELECT id, first_name, last_name, role
--       FROM public.profiles ORDER BY first_name;
--
--       -- nadaj rolę admin:
--       UPDATE public.profiles SET role = 'admin'
--       WHERE id = 'TWOJ-UUID';
--
--       -- nadaj rolę restaurant kucharzowi:
--       UPDATE public.profiles SET role = 'restaurant'
--       WHERE id = 'UUID-KUCHARZA';
-- ============================================================


-- ============================================================
-- 12. KROKI WERYFIKACJI
--   a) zarejestruj nowego pracownika w UI → w profiles powstaje wpis (trigger).
--   b) zaloguj się jako pracownik → SELECT * FROM profiles ma zwrócić 1 wiersz.
--   c) z DevTools spróbuj:
--        supabase.from('orders').insert({...}) → ma się wywalić (RLS).
--        supabase.from('menu_items').insert({...}) → ma się wywalić.
--        supabase.from('profiles').update({role:'admin'}).eq('id', user.id) → ma się wywalić.
--   d) zalogowany pracownik widzi tylko swoje zamówienia.
-- ============================================================
