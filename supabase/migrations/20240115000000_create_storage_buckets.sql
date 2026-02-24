-- ============================================================================
-- STORAGE BUCKETS MIGRATION
-- ============================================================================
-- Creates 3 storage buckets with proper RLS policies:
-- 1. device-images (public): Device catalog photos, triage images
-- 2. documents (private): Invoices, shipping labels, warranties
-- 3. uploads (private): CSV uploads for pricing/orders

-- Create storage buckets
insert into storage.buckets (id, name, public) values
  ('device-images', 'device-images', true),
  ('documents', 'documents', false),
  ('uploads', 'uploads', false);

-- ============================================================================
-- DEVICE IMAGES BUCKET (Public Read, Internal Write)
-- ============================================================================

create policy "Public can view device images"
  on storage.objects for select
  using (bucket_id = 'device-images');

create policy "Internal users can upload device images"
  on storage.objects for insert
  with check (
    bucket_id = 'device-images'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'coe_manager', 'coe_tech')
    )
  );

create policy "Internal users can update device images"
  on storage.objects for update
  using (
    bucket_id = 'device-images'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'coe_manager', 'coe_tech')
    )
  );

create policy "Admins can delete device images"
  on storage.objects for delete
  using (
    bucket_id = 'device-images'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- ============================================================================
-- DOCUMENTS BUCKET (Private, Internal Only)
-- ============================================================================

create policy "Internal users can view documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'coe_manager', 'coe_tech', 'sales')
    )
  );

create policy "Internal users can upload documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'coe_manager', 'coe_tech', 'sales')
    )
  );

create policy "Internal users can update documents"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'coe_manager', 'coe_tech', 'sales')
    )
  );

create policy "Admins can delete documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- ============================================================================
-- UPLOADS BUCKET (Private, Admin Only)
-- ============================================================================

create policy "Admins can view uploads"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

create policy "Admins can upload files"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

create policy "Admins can update uploads"
  on storage.objects for update
  using (
    bucket_id = 'uploads'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

create policy "Admins can delete uploads"
  on storage.objects for delete
  using (
    bucket_id = 'uploads'
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );
