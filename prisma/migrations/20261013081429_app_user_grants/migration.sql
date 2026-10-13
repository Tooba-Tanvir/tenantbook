-- This is an empty migration.GRANT USAGE ON SCHEMA public TO app_user;
GRANT EXECUTE ON FUNCTION public.resolve_tenant(text) TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;