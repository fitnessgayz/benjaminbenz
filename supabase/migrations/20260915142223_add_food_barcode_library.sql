alter table public.shared_food_library
  add column if not exists barcode text;

alter table public.shared_food_library
  drop constraint if exists shared_food_library_source_check;

alter table public.shared_food_library
  add constraint shared_food_library_source_check
  check (source in ('food_label', 'barcode'));

alter table public.shared_food_library
  drop constraint if exists shared_food_library_barcode_check;

alter table public.shared_food_library
  add constraint shared_food_library_barcode_check
  check (barcode is null or barcode ~ '^(?:[0-9]{8}|[0-9]{13,14})$');

create unique index if not exists shared_food_library_barcode_idx
  on public.shared_food_library (barcode)
  where barcode is not null;

comment on column public.shared_food_library.barcode is
  'Canonical GTIN used to find a reviewed packaged food. UPC-A values are stored as zero-padded GTIN-13.';

comment on table public.shared_food_library is
  'Reviewed nutrition-label and barcode foods shared read-only with every authenticated client. Source photos are processed transiently and are not stored. Barcode product data may originate from Open Food Facts under ODbL.';
