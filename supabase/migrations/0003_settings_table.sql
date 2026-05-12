-- ============================================================
-- system-obiadow — krok 3: Tabela ustawień systemowych (godziny brzegowe)
-- Plik można bezpiecznie uruchomić w Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  id integer PRIMARY KEY DEFAULT 1,
  order_cutoff_shift1 time NOT NULL DEFAULT '09:00:00',
  order_cutoff_shift2 time NOT NULL DEFAULT '12:00:00',
  cancel_cutoff_shift1 time NOT NULL DEFAULT '09:00:00',
  cancel_cutoff_shift2 time NOT NULL DEFAULT '12:00:00',
  updated_at timestamp with time zone DEFAULT now()
);

-- Upewnienie się, że tabela ma zawsze tylko jeden wiersz (id=1)
ALTER TABLE public.system_settings ADD CONSTRAINT single_row_check CHECK (id = 1);

-- Jeśli tabela jest nowa i pusta, dodajemy domyślne ustawienia
INSERT INTO public.system_settings (id, order_cutoff_shift1, order_cutoff_shift2, cancel_cutoff_shift1, cancel_cutoff_shift2)
VALUES (1, '09:00:00', '12:00:00', '09:00:00', '12:00:00')
ON CONFLICT (id) DO NOTHING;

-- RLS (Row Level Security)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Wszyscy zalogowani użytkownicy mogą odczytać ustawienia, by wiedzieć, do kiedy zamawiać/anulować
CREATE POLICY "Każdy zalogowany może odczytać ustawienia" 
  ON public.system_settings FOR SELECT 
  TO authenticated 
  USING (true);

-- Tylko 'admin' oraz 'restaurant' mogą modyfikować ustawienia
CREATE POLICY "Restauracja i Admin mogą edytować ustawienia" 
  ON public.system_settings FOR UPDATE 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'restaurant')
    )
  );

-- Zapobiegamy usuwaniu jedynego wiersza
CREATE POLICY "Zakaz usuwania ustawień"
  ON public.system_settings FOR DELETE
  TO authenticated
  USING (false);

-- Zapobiegamy wstawianiu dodatkowych wierszy
CREATE POLICY "Zakaz dodawania nowych wierszy (dozwolony tylko Update)"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (false);
