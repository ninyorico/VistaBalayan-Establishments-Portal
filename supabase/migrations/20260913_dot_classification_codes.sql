-- Allow the controlled DOT classification codes while preserving legacy labels.
-- This changes only the validation constraint; existing establishment rows are untouched.

alter table public.establishments
drop constraint if exists establishments_dot_classification_check;

alter table public.establishments
  add constraint establishments_dot_classification_check
  check (dot_classification is null or dot_classification in (
    -- Current DOT codes
    'HTL', 'RES', 'APA', 'INN', 'PEN', 'MOT', 'ECO', 'HMS', 'CMP', 'OTH',
    -- Historical values already stored in the database
    'Hotel', 'Resort', 'Apartment Hotel', 'Mabuhay Accommodation', 'Homestay'
  )) not valid;
