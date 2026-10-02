-- ====================================================================
-- SEC-STOR-01: DROP COMPETING LEGACY STORAGE POLICIES
-- Target: storage.objects
-- Identified directly from Supabase Dashboard (Storage -> Policies)
-- ====================================================================

DROP POLICY IF EXISTS "Users can update their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own storage files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own storage files" ON storage.objects;
