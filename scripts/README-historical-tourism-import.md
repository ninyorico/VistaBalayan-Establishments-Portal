# Historical tourism Excel import

This repo includes `scripts/import-historical-tourism-data.mjs`, an executable cleanup/import utility for VistaBalayan historical tourism workbooks.

## Required access

- Google Drive folder must be shared as **Anyone with the link** before files can be downloaded by the runner.
- Supabase service-role credentials are required because the import intentionally cleans protected report/generated tables while preserving Auth users, profiles, establishments, and account-establishment relationships.

## Download files from Google Drive

```bash
mkdir -p /opt/data/vistabalayan_gdrive_import/source
uvx gdown --folder 'https://drive.google.com/drive/folders/19n-0490p0PzBSWfjGJhTbFYzDwqOMfFi?usp=drive_link' -O /opt/data/vistabalayan_gdrive_import/source
```

If this returns HTTP 401, update the Drive folder sharing to `Anyone with the link` and rerun.

## Dry-run parse/validation

```bash
SOURCE_DIR=/opt/data/vistabalayan_gdrive_import/source \
SUPABASE_URL='https://fzamvdvdxslmnltqpbnv.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY' \
node scripts/import-historical-tourism-data.mjs --dry-run
```

Outputs are written to `/opt/data/vistabalayan_gdrive_import/output/`:

- `prepared-accommodation.json`
- `prepared-visitor.json`
- `prepared-room-details.json`
- timestamped `import-summary-*.json`

## Execute cleanup/import

```bash
SOURCE_DIR=/opt/data/vistabalayan_gdrive_import/source \
SUPABASE_URL='https://fzamvdvdxslmnltqpbnv.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY' \
EXECUTE_IMPORT=true \
node scripts/import-historical-tourism-data.mjs
```

The script:

1. Reads existing `establishments` and `profiles`.
2. Parses every `.xlsx/.xlsm/.xls` workbook and sheet under `SOURCE_DIR`.
3. Infers visitor vs accommodation formats from headers/content.
4. Matches each sheet to an existing establishment and submitted-by account.
5. Preserves Auth users, profiles, establishments, and relationships.
6. Deletes report/generated data in FK-safe order.
7. Imports daily accommodation reports, visitor group records, and available room details.
8. Writes a summary with counts, unmatched rows, suspicious dates, duplicates, and date ranges.

The script defaults to dry-run unless `EXECUTE_IMPORT=true` is set.
