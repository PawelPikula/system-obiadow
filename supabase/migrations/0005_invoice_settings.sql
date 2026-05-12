-- ============================================================
-- Dane restauracji do faktur + tabela rejestru faktur
-- Uruchom w Supabase → SQL Editor
-- ============================================================

-- Pola danych sprzedawcy (restauracji) w ustawieniach systemowych
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS restaurant_name        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS restaurant_nip         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS restaurant_address     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS restaurant_bank_account text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_payment_days   integer NOT NULL DEFAULT 14;

-- Tabela rejestru faktur (przypisanie numeru do miesiąca)
-- Jeden wiersz per miesiąc per typ (revenue / cost).
-- Numer tworzony przy pierwszym otwarciu faktury danego miesiąca.
CREATE TABLE IF NOT EXISTS public.invoice_registry (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month     text        NOT NULL,                          -- 'YYYY-MM'
  invoice_type   text        NOT NULL CHECK (invoice_type IN ('revenue', 'cost')),
  invoice_number text        NOT NULL,                          -- np. 'FV/2025/001'
  created_at     timestamptz DEFAULT now(),
  UNIQUE (year_month, invoice_type)
);

-- Sekwencje numerów (osobna per typ, reset co rok jeśli potrzebne)
CREATE SEQUENCE IF NOT EXISTS public.invoice_revenue_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_cost_seq   START 1;

-- RLS
ALTER TABLE public.invoice_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_registry_read"   ON public.invoice_registry;
DROP POLICY IF EXISTS "invoice_registry_insert" ON public.invoice_registry;

CREATE POLICY "invoice_registry_read"
  ON public.invoice_registry FOR SELECT
  TO authenticated
  USING (public.is_restaurant());

CREATE POLICY "invoice_registry_insert"
  ON public.invoice_registry FOR INSERT
  TO authenticated
  WITH CHECK (public.is_restaurant());

-- ============================================================
-- RPC: pobierz (lub utwórz) numer faktury dla danego miesiąca
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_or_create_invoice_number(
  p_year_month text,
  p_type       text   -- 'revenue' | 'cost'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text;
  v_seq    bigint;
BEGIN
  -- Jeśli numer już istnieje, zwróć go
  SELECT invoice_number INTO v_number
    FROM invoice_registry
   WHERE year_month = p_year_month AND invoice_type = p_type;

  IF v_number IS NOT NULL THEN
    RETURN v_number;
  END IF;

  -- Pobierz następny numer z sekwencji
  IF p_type = 'revenue' THEN
    v_seq := nextval('invoice_revenue_seq');
    v_number := 'FV/' || substring(p_year_month, 1, 4) || '/' || lpad(v_seq::text, 3, '0');
  ELSE
    v_seq := nextval('invoice_cost_seq');
    v_number := 'FK/' || substring(p_year_month, 1, 4) || '/' || lpad(v_seq::text, 3, '0');
  END IF;

  INSERT INTO invoice_registry (year_month, invoice_type, invoice_number)
  VALUES (p_year_month, p_type, v_number)
  ON CONFLICT (year_month, invoice_type) DO UPDATE
    SET invoice_number = invoice_registry.invoice_number  -- nie nadpisuj istniejącego
  RETURNING invoice_number INTO v_number;

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_invoice_number(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_invoice_number(text, text) TO authenticated;
