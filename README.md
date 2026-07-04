# My Learning Brain

My Learning Brain is a personal memory assistant for your learning, work, and daily life.  
It helps you save useful thoughts, lessons, reminders, and discoveries so you can ask for them again when you need them.

## Local Setup

Set these environment variables before running or deploying:

- `GOOGLE_API_KEY`: required for Gemini chat, summaries, coaching, and embeddings.
- `NEXT_PUBLIC_SUPABASE_URL`: required for storage and memory retrieval.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: required for the client and API routes.
- `NEXT_PUBLIC_DEMO_USER_ID`: optional single-user ID for this demo UI. If omitted, the app falls back to the current local demo user.

Apply the SQL migrations in `/supabase/migrations`, including `20260623000000_memory_intelligence_layer.sql`, before using the memory intelligence features in production.

## Production Readiness Notes

- The app now fails fast with a clear server error if `GOOGLE_API_KEY` is missing, instead of failing later during Gemini calls.
- The frontend demo user is configurable with `NEXT_PUBLIC_DEMO_USER_ID`, which makes deployment safer than relying on a source-code-only magic value.
- Validate a production build with `npm run build`, `npm run lint`, and `npm run test`.

## Simple Flow

1. Save something useful you learned.
2. Come back later and ask about that topic.
3. Get a helpful answer from what you already stored.
4. Notice what you know well and what still needs review.

## How You Can Use It

- Save notes from meetings, study sessions, or personal projects.
- Ask what you already know before starting a task.
- Revisit past lessons instead of relearning from scratch.
- Use it as a steady thinking partner when your memory feels crowded.
