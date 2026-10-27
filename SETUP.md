# SHAKIB TRADERS — Setup

1. **Supabase**: create a project → SQL Editor → paste & run `schema.sql` once (safe to re-run).
2. **GitHub**: push this folder to a repo.
3. **Vercel**: import the repo. Add env vars (see `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service_role), `AUTH_SECRET` (≥16 chars). Deploy.
4. **First login**: PIN `12345` (owner) → you are forced to set a new 5-digit PIN.
4b. **Pre-load October data (optional, no Excel upload needed)**: in the Supabase SQL Editor run the files in `seed/` in order: `1-companies.sql`, then `2-…`, `3-…`, `4-…`, `5-…` (one query each). Regenerate with `node scripts/make-seed.js workbook.xlsx seed`.
5. **Import data**: Settings → Excel ইমপোর্ট → choose the monthly workbook → check preview → import.
6. **SO access**: open a company → "অ্যাক্সেস" tab → add SO → generate/set PIN. PINs are stored hashed; the owner can reset but never view them. Each SO sees only his own company; an optional "finance" permission shows commission/expenses/ledger.
7. **Add a company** (e.g. the 5th): Home → "+ নতুন কোম্পানি".

## Notes
- Vercel Hobby allows 12 functions; this app uses 8 (`api/_lib` doesn't count).
- SO can edit today and the last 7 days (`SO_EDIT_DAYS`); older/closed days only the owner.
- The October workbook has 4 companies (Mr.Noddles, Pasturized, Jhotphot, Abul Kahir); the app supports any number.
- Excel quirks: some days have totals but cleared lines (imported as one unitemized line); a few products go negative in stock (Excel lookup quirk, e.g. ' 200gm Chese'); Day N → 2026-10-N; "Over Sales" counted as extra sales; damage deducted only on days flagged.
- Local tests: `bash test/run.sh` (needs local Postgres, see test/).
