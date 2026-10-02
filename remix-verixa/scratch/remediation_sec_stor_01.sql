-- ====================================================================
-- SEC-STOR-01 REMEDIATION: STORAGE RLS FOLDER ISOLATION (CORRECTED)
-- Target: storage.objects on bucket 'app-files'
-- NOTE: Omitted "ALTER TABLE storage.objects" because RLS is already
-- enabled by Supabase and the table is owned by supabase_storage_admin.
-- ====================================================================

-- Step 1: Ensure app-files bucket exists and is properly configured
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-files', 'app-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Step 2: Drop existing permissive, legacy, or divergent policies
DROP POLICY IF EXISTS "Public can view app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to app-files under their UID folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own app-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow all authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow all uploads" ON storage.objects;

-- Step 3: SELECT Policy — Public read access for social feed media & profile assets
CREATE POLICY "Public can view app-files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'app-files');

-- Step 4: INSERT Policy — Upload strictly permitted ONLY when first path segment matches auth.uid()
CREATE POLICY "Authenticated users can upload to app-files under their UID folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Step 5: UPDATE Policy — Update strictly permitted ONLY within user's own UID folder
CREATE POLICY "Users can update their own app-files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Step 6: DELETE Policy — Deletion strictly permitted ONLY within user's own UID folder
CREATE POLICY "Users can delete their own app-files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
