# VistaBalayan Establishment Portal

An authenticated tourism-management workspace for municipal tourism officers and establishment staff in Balayan, Batangas.

## Features

- Secure login and account access
- Municipal officer dashboard and establishment management
- Daily visitor and accommodation report submission
- Report monitoring, approval, analytics, and submission history
- Establishment profile and public listing management
- Notifications and staff-only account functions
- AI-assisted staff insights

## Tech Stack

- React 18
- Tailwind CSS
- Supabase (PostgreSQL and authentication)
- Google Gemini AI
- Vite
- Vercel serverless functions for protected server-side operations and email OTP workflows

## Local Setup

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy the environment template and fill in the Supabase, AI, mapping, OTP, and email-service values:
   ```bash
   cp .env.example .env.local
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

Required browser variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`

Required server-only variables for deployed API functions are documented in `.env.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OTP_HASH_SECRET`, `EMAILJS_PRIVATE_KEY`, or other server secrets through `VITE_` variables or source control.
