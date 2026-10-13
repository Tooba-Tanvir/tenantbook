CREATE OR REPLACE FUNCTION resolve_tenant(p_slug text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT "id" FROM "Tenant" WHERE "slug" = p_slug $$;

GRANT EXECUTE ON FUNCTION resolve_tenant(text) TO app_user;
