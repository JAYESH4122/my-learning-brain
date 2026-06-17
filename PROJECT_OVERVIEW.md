# My Learning Brain Project Overview

Last explored: 2026-06-17

## What This App Does

My Learning Brain is a Next.js chat app that works as a personal learning memory assistant.

The user can:

- Save short learning notes as memories.
- Ask questions against previously saved memories.
- Ask knowledge-check questions such as "Do I know about RAG?"
- Ask for code review by saying "review this code", "code review", "refactor this", or by sending a fenced code block.

The app uses Gemini for classification, answer generation, code review, and embeddings. It uses Supabase to store memories and vector embeddings.

## Tech Stack

- Next.js 16 app router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase JavaScript client
- Gemini SDK through `@google/genai`
- `react-markdown`, `remark-gfm`, and `react-syntax-highlighter` for assistant markdown/code rendering
- `lucide-react` icons

## Environment Variables

The local `.env` contains these variable names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_API_KEY`
- `EMBEDDING_URL`

Only the names were inspected during this review. The values were not copied into this document.

Current code usage:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used by `src/lib/supabaseClient.ts`.
- `GOOGLE_API_KEY` is used by `src/lib/gemini.ts` and `src/lib/embeddings.ts`.
- `EMBEDDING_URL` exists in `.env`, but no current source file reads it.

`.env*` files are ignored by `.gitignore`.

## Main Files

- `src/app/page.tsx`: client chat UI.
- `src/app/api/brain/route.ts`: main learning, recall, Q&A, and code-review API.
- `src/app/api/summarize/route.ts`: standalone summary API.
- `src/app/api/addMemory/route.ts`: direct memory insert API.
- `src/lib/gemini.ts`: Gemini text generation helpers.
- `src/lib/embeddings.ts`: Gemini embedding helper.
- `src/lib/supabaseClient.ts`: Supabase client setup.
- `src/prompts/codeReviewer.ts`: code-review prompt template.
- `src/app/globals.css`: Tailwind import and small global CSS helpers.
- `src/app/layout.tsx`: metadata, font setup, and root layout.

## Frontend Flow

The first screen is the chat interface in `src/app/page.tsx`.

1. The user types into the chat input.
2. `handleSubmit` adds the user message to local React state.
3. The frontend sends `POST /api/brain` with:

```json
{
  "inputText": "the user message",
  "userId": "54ad7274-ddff-4727-9ca0-84097b044c11"
}
```

4. The UI accepts several possible response fields from the API:

- `response`
- `answer`
- `message`
- `error`

5. Assistant responses are rendered with markdown support. Fenced code blocks get syntax highlighting, line numbers, and a copy button.

Important behavior: the `userId` is currently hard-coded in `src/app/page.tsx`.

## Main API Flow: `/api/brain`

`POST /api/brain` expects:

```json
{
  "inputText": "required text",
  "userId": "required user UUID"
}
```

If either field is missing, the route returns `400`.

The route then follows this decision flow:

1. Detect code-review mode.
   - Triggers when the text includes "review this code", "code review", "refactor this", or a fenced code block.
   - Uses `CODE_REVIEW_PROMPT`.
   - Calls Gemini through `generateSummary`.
   - Does not save the code review to memory.

2. Classify the input as a question or statement.
   - Uses Gemini with a one-word classification prompt.
   - Falls back to simple question-pattern matching if Gemini classification fails.

3. Ignore very short acknowledgements.
   - Examples: `yes`, `no`, `ok`, `sure`.
   - Returns a friendly acknowledgement without storing.

4. Search memory context.
   - Embeds the input with Gemini embedding model `gemini-embedding-001`.
   - Calls Supabase RPC `match_memories`.
   - Uses a threshold of `0.5` and a match count of `10`.
   - Filters by `user_id` if the RPC result includes that field.

5. For questions with no vector matches, fetch recent memories as fallback.
   - Reads up to 30 recent memories for the user.

6. For "Do I know about..." style questions:
   - Checks stored memories for direct or related topic matches.
   - If found, Gemini answers from stored memory context.
   - If not found, Gemini generates a new answer, stores it as a learned memory, and stores its embedding.

7. For normal questions:
   - If stored memories answer the question, Gemini answers only from those memories.
   - If not found, Gemini generates an answer, then tries to store it and its embedding.
   - If generated-answer storage fails, the API still returns the answer with `saved: false`.

8. For statements:
   - Checks for exact or near-duplicate stored memories.
   - Saves new information exactly as provided.
   - Stores an embedding in `memory_vectors`.
   - If saving fails, the API returns a normal chat response with `saved: false` instead of a `500`.

## Other API Routes

### `POST /api/summarize`

Expected request:

```json
{
  "InputText": "text to summarize"
}
```

If `InputText` is missing, the route returns `400`.

The route asks Gemini to summarize the learning note into clear, structured points.

### `POST /api/addMemory`

Expected request fields:

- `user_id`
- `title`
- `body`
- `user_phrasing`
- `memory_type`
- `tags`
- `source`

The route inserts directly into the Supabase `memories` table and returns the inserted row.

`GET /api/addMemory` returns `405` with a message telling callers to use `POST`.

## Expected Supabase Shape

The source code expects at least:

### `memories` table

Fields used by the app:

- `id`
- `user_id`
- `title`
- `body`
- `user_phrasing`
- `memory_type`
- `tags`
- `source`
- `created_at`

### `memory_vectors` table

Fields used by the app:

- `memory_id`
- `embedding`

The embedding dimension is `1536`.

### `match_memories` RPC

The app calls:

```ts
supabase.rpc("match_memories", {
  query_embedding,
  match_threshold: 0.5,
  match_count: 10,
});
```

The RPC should return rows with at least `body`, and ideally `id`, `title`, `user_id`, and any similarity metadata needed by the database layer.

## Gemini Usage

`generateSummary`:

- Model: `gemini-2.5-flash`
- Temperature: `0.2`
- Used for summarization, classification, stored-memory answering, and code review.

`generateWithWebSearch`:

- Model: `gemini-2.5-flash`
- Temperature: `0.3`
- Despite the function name, it does not currently enable a real web-search tool. It prompts Gemini to answer from model knowledge.

`embedText`:

- Model: `gemini-embedding-001`
- Output dimensionality: `1536`

## Local Commands

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Run TypeScript checking:

```bash
npx tsc --noEmit
```

Build for production:

```bash
npm run build
```

Start a production build:

```bash
npm run start
```

## Verification Performed

These checks passed on 2026-06-17:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Production build summary:

- `/` is statically prerendered.
- `/api/addMemory`, `/api/brain`, and `/api/summarize` are dynamic API routes.

Local smoke checks against `http://127.0.0.1:3000`:

- `GET /` returned `200 text/html`.
- `GET /api/addMemory` returned `405 application/json`.
- `POST /api/brain` with `{}` returned `400` and `{"error":"inputText and userId are required"}`.
- `POST /api/summarize` with `{}` returned `400` and `{"error":"Prompt is required"}`.

Full Gemini/Supabase mutation flows were not exercised during smoke testing because they can create memories, vectors, and external API calls.

## Notes And Risks

- There is no automated test suite beyond lint, TypeScript checking, and build.
- The frontend hard-codes one `userId`; multi-user behavior would need authentication or user selection.
- `generateWithWebSearch` is not actual web search right now.
- Generated answers and user-provided statements are resilient to memory-save failures and return `saved: false` when persistence fails.
- The app depends on Supabase schema/RPC setup that is not represented in this repository.
- The app uses the Supabase anon key from server-side route code. Make sure Supabase Row Level Security policies are configured correctly before using this with real users.
- Code-review responses are intentionally not stored as memories.
- The `.env` includes `EMBEDDING_URL`, but it appears unused.

## Quick Troubleshooting

- If build fails with environment errors, confirm the `.env` variable names listed above exist.
- If `/api/brain` returns a Gemini error, check `GOOGLE_API_KEY`.
- If memory search fails, check the `match_memories` RPC signature and vector dimension.
- If memory inserts fail, check the `memories` and `memory_vectors` table columns and RLS policies.
- If answers ignore saved memory, inspect whether `match_memories` returns `user_id` and whether it filters by user in the database.
