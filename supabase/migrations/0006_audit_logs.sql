-- ============================================================
-- 0006_audit_logs.sql
-- Tabela logów audytowych dla zmian roli i dofinansowania
-- ============================================================

-- 1. Tabela audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL, -- 'update_role', 'update_subsidy', etc.
  target_id uuid,      -- ID użytkownika lub firmy
  old_value jsonb,
  new_value jsonb,
  details text
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Tylko admin widzi logi
CREATE POLICY "admin_select_audit_logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin());

-- 2. Trigger dla zmian w profiles (rola)
CREATE OR REPLACE FUNCTION public.log_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.company_id IS DISTINCT FROM NEW.company_id THEN
    INSERT INTO public.audit_logs (actor_id, action, target_id, old_value, new_value, details)
    VALUES (
      auth.uid(),
      'profile_update',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'company_id', OLD.company_id),
      jsonb_build_object('role', NEW.role, 'company_id', NEW.company_id),
      'Zmiana danych profilu użytkownika: ' || NEW.first_name || ' ' || NEW.last_name
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_log_profile_changes ON public.profiles;
CREATE TRIGGER tr_log_profile_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.log_profile_changes();

-- 3. Trigger dla zmian w companies (subsidy)
CREATE OR REPLACE FUNCTION public.log_company_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.daily_subsidy IS DISTINCT FROM NEW.daily_subsidy THEN
    INSERT INTO public.audit_logs (actor_id, action, target_id, old_value, new_value, details)
    VALUES (
      auth.uid(),
      'company_update',
      NEW.id,
      jsonb_build_object('daily_subsidy', OLD.daily_subsidy),
      jsonb_build_object('daily_subsidy', NEW.daily_subsidy),
      'Zmiana dofinansowania dla firmy: ' || NEW.name
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_log_company_changes ON public.companies;
CREATE TRIGGER tr_log_company_changes
  AFTER UPDATE ON public.companies
  FOR EACH ROW EXECUTE PROCEDURE public.log_company_changes();
