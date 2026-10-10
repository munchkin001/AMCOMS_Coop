ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS additional_emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE
  def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_own_profile';

  IF def NOT LIKE '%additional_emergency_contacts%' THEN
    def := replace(
      def,
      E'emergency_contact_relationship = NULLIF(trim(p_profile ->> ''emergency_contact_relationship''), '''')\n    WHERE id = actor.member_id;',
      E'emergency_contact_relationship = NULLIF(trim(p_profile ->> ''emergency_contact_relationship''), ''''),\n        additional_emergency_contacts = CASE WHEN jsonb_typeof(p_profile -> ''additional_emergency_contacts'') = ''array'' THEN p_profile -> ''additional_emergency_contacts'' ELSE ''[]''::jsonb END\n    WHERE id = actor.member_id;'
    );
    def := replace(def, E'\r\n', E'\n');
    def := replace(
      def,
      E'emergency_contact_relationship = NULLIF(trim(p_profile ->> ''emergency_contact_relationship''), '''')\n    WHERE id = actor.member_id;',
      E'emergency_contact_relationship = NULLIF(trim(p_profile ->> ''emergency_contact_relationship''), ''''),\n        additional_emergency_contacts = CASE WHEN jsonb_typeof(p_profile -> ''additional_emergency_contacts'') = ''array'' THEN p_profile -> ''additional_emergency_contacts'' ELSE ''[]''::jsonb END\n    WHERE id = actor.member_id;'
    );
    IF def NOT LIKE '%additional_emergency_contacts%' THEN
      RAISE EXCEPTION 'update_own_profile patch did not apply';
    END IF;
    EXECUTE def;
  END IF;
END $$;
