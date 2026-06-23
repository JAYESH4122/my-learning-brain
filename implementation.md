# Learning Brain Implementation Plan

Last updated: 2026-06-23

## Goal

Turn My Learning Brain from a chat-based memory assistant into a smarter personal learning system.

The app should not only save and recall memories. It should understand how memories connect, detect what the user knows or does not know, help the user learn from their own saved knowledge, and show useful review/summary insights over time.

This document is the implementation roadmap for the following feature set:

- Project / Space Support
- Auto Tagging + Topic Clustering
- Duplicate + Contradiction Detection
- Memory Confidence Score
- Knowledge Gap Detector
- Teach Me From My Brain Mode
- Concept Map / Learning Graph
- Weekly Learning Summary

## Current App State

The current app is a Next.js chat app using:

- Next.js app router
- React
- TypeScript
- Tailwind CSS
- Supabase
- Gemini for generation, classification, code review, and embeddings

The main flow is:

1. User sends a message from `src/app/page.tsx`.
2. The frontend calls `POST /api/brain`.
3. The backend classifies the input as a question or statement.
4. Statements are saved as memories.
5. Questions search memory vectors and answer from stored memory when possible.
6. If stored memory is missing, Gemini answers and the answer may be saved as a new memory.

Current main tables:

- `memories`
- `memory_vectors`
- `chat_sessions`
- `chat_messages`

Current important limitation:

- The app has a hard-coded `USER_ID`.
- There is no real project/space system.
- Memory tags are supported by the database shape, but not intelligently generated.
- Duplicate detection is basic.
- Contradiction detection does not exist yet.
- There is no confidence score, topic graph, weekly summary, or teach mode.

## Core Architecture Idea

Add a new layer called the Memory Intelligence Layer.

Every saved memory should pass through this pipeline:

```txt
User input or AI-generated answer
  -> classify input intent
  -> search related memories
  -> analyze memory metadata
  -> detect duplicate/similar/contradictory memories
  -> assign space
  -> assign topic and tags
  -> assign initial confidence
  -> save memory and embedding
  -> save topic links and memory relations
  -> save memory event log
  -> return structured response metadata to the UI
```

This single pipeline supports all requested features:

- Spaces use the assigned `space_id`.
- Auto tagging uses generated `tags` and `topic`.
- Topic clustering uses normalized topics.
- Duplicate detection uses related vector matches plus Gemini comparison.
- Contradiction detection uses related vector matches plus Gemini comparison.
- Confidence score uses memory metadata and review events.
- Knowledge gap detection uses vector matches, tags, topics, and confidence.
- Teach mode uses known points plus missing points.
- Concept graph uses topics and memory relations.
- Weekly summary uses memories, events, confidence, and relations.

## Feature Details

### 1. Project / Space Support

Purpose:

Organize memories into learning areas or projects.

Examples:

- AI
- Coding
- Career
- Personal
- General
- Project-specific spaces such as `Learning Brain`, `RAG App`, or `Interview Prep`

Expected behavior:

- Every memory belongs to one space.
- User can choose the current space in the UI.
- If the user does not choose a space, the backend should infer one.
- If inference is uncertain, save to `General`.
- Question answering should prefer the current space but can still use global memories when needed.

Why this comes first:

Spaces improve search quality, summaries, graph organization, and teach mode.

### 2. Auto Tagging + Topic Clustering

Purpose:

Automatically label and group memories.

Expected behavior:

- When saving a memory, Gemini should return:
  - short title
  - primary topic
  - tags
  - memory type
  - suggested space
  - related concepts

Example:

```json
{
  "title": "RAG uses retrieval before generation",
  "topic": "RAG",
  "tags": ["rag", "retrieval", "embeddings", "vector-search"],
  "memoryType": "concept",
  "suggestedSpace": "AI",
  "relatedTopics": ["embeddings", "vector databases", "chunking"]
}
```

Topic clustering approach:

- Store a normalized primary topic on the memory.
- Create or reuse topic records.
- Connect memories that share the same topic or related topics.
- Use vector similarity for soft relation discovery.

### 3. Duplicate + Contradiction Detection

Purpose:

Prevent the memory base from becoming noisy or misleading.

Chosen save policy:

- Always auto-save.
- If a duplicate, similar memory, or contradiction is detected, save it anyway.
- Mark it with `needs_review=true`.
- Add a relation explaining the issue.

Detection categories:

- `exact_duplicate`: same fact, no new value.
- `near_duplicate`: same idea with slightly different wording.
- `adds_detail`: related memory with useful extra information.
- `contradiction`: new memory conflicts with an old memory.
- `unrelated`: no issue.

Expected behavior:

- Similar memories should be linked.
- Contradictory memories should be linked and marked for review.
- The assistant response should mention the issue naturally.

Example response:

```txt
Saved. I also found a possible contradiction with an older memory, so I marked this for review.
```

### 4. Memory Confidence Score

Purpose:

Track how well the user knows each memory.

Fields:

- `confidence_score`: number from 0 to 100
- `confidence_status`: text status
- `review_count`: number
- `last_reviewed_at`: timestamp
- `review_due_at`: timestamp

Suggested statuses:

- `new`: newly saved, not reviewed
- `learning`: seen but not strong yet
- `needs_review`: weak, old, contradictory, or user got it wrong
- `strong`: reviewed successfully
- `mastered`: repeatedly answered correctly

Initial scoring:

- User-provided memory starts around 50.
- AI-generated learning starts around 35 because the user may not truly know it yet.
- Contradictory or duplicate memories may start lower or be marked `needs_review`.

Confidence changes:

- Increase when the user answers review questions correctly.
- Decrease when the user cannot answer or asks the same basic question repeatedly.
- Set `needs_review` when contradiction is detected.

### 5. Knowledge Gap Detector

Purpose:

Tell the user whether they already know a topic, partially know it, or do not know it yet.

Expected statuses:

- `known`
- `partial`
- `unknown`

Input examples:

- `Do I know about RAG?`
- `What are my gaps in embeddings?`
- `Do I understand vector databases?`

Output should include:

- status
- known points from saved memory
- missing points
- related memories
- suggested next learning steps

Example output:

```txt
You partially know RAG.

You already know:
- RAG retrieves relevant context before generation.
- Embeddings help find related documents.

Your gaps:
- Chunking strategy
- Reranking
- Evaluation
```

### 6. Teach Me From My Brain Mode

Purpose:

Teach a topic using the user's own memories first, then fill missing gaps.

Input examples:

- `Teach me from my brain: RAG`
- `Teach me what I know about Supabase`
- `Teach me from my saved notes about embeddings`

Response structure:

1. What you already know
2. Missing pieces
3. Simple lesson
4. Examples
5. Quick quiz
6. Suggested memory updates

Important behavior:

- The assistant should clearly separate saved user knowledge from newly generated explanation.
- Newly generated gap-filling content can be saved as an AI-generated memory.
- AI-generated memories should have lower initial confidence than user-provided memories.

### 7. Concept Map / Learning Graph

Purpose:

Show how memories and topics connect.

First version:

- Simple graph data API.
- Nodes are topics and important memories.
- Edges are relations.
- UI can start as a simple list/tree if graph rendering is too much for phase 1.

Node types:

- `space`
- `topic`
- `memory`

Relation types:

- `related_to`
- `duplicate_of`
- `contradicts`
- `depends_on`
- `example_of`
- `part_of`

Example:

```txt
AI
  -> RAG
      -> Embeddings
      -> Vector Search
      -> Chunking
```

### 8. Weekly Learning Summary

Purpose:

Give the user a weekly recap of learning activity and review suggestions.

Summary should include:

- memories saved this week
- top topics
- strongest topic
- weakest topic
- contradictions or duplicates found
- memories due for review
- suggested next topics

Input examples:

- `weekly summary`
- `show my weekly learning summary`
- `summarize what I learned this week`

Output structure:

```txt
This week you learned mostly about AI and Supabase.

New memories:
- ...

Topics growing:
- ...

Needs review:
- ...

Suggested next steps:
- ...
```

## Proposed Database Changes

Add a new migration under `supabase/migrations`.

### Extend `memories`

Add columns:

```sql
alter table public.memories
  add column if not exists space_id uuid,
  add column if not exists topic text,
  add column if not exists confidence_score integer not null default 50,
  add column if not exists confidence_status text not null default 'new',
  add column if not exists review_count integer not null default 0,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists review_due_at timestamptz,
  add column if not exists needs_review boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();
```

Add checks later if needed:

- `confidence_score` between 0 and 100
- `confidence_status` in known status list

### New `spaces` Table

```sql
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
```

Default spaces:

- General
- AI
- Coding
- Career
- Personal

### New `memory_topics` Table

```sql
create table if not exists public.memory_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  space_id uuid references public.spaces(id) on delete set null,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);
```

### New `memory_topic_links` Table

```sql
create table if not exists public.memory_topic_links (
  memory_id uuid not null references public.memories(id) on delete cascade,
  topic_id uuid not null references public.memory_topics(id) on delete cascade,
  relation text not null default 'primary',
  created_at timestamptz not null default now(),
  primary key (memory_id, topic_id)
);
```

### New `memory_relations` Table

```sql
create table if not exists public.memory_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_memory_id uuid not null references public.memories(id) on delete cascade,
  target_memory_id uuid not null references public.memories(id) on delete cascade,
  relation_type text not null,
  strength double precision not null default 0.5,
  reason text,
  created_at timestamptz not null default now()
);
```

### New `memory_events` Table

```sql
create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  memory_id uuid references public.memories(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

### New `weekly_summaries` Table

```sql
create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  space_id uuid references public.spaces(id) on delete set null,
  week_start date not null,
  summary text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, space_id, week_start)
);
```

### Update `match_memories`

The RPC should eventually support:

- user filtering
- optional `space_id`
- returning tags, topic, confidence, and needs_review

Suggested v2 signature:

```sql
match_memories(
  query_embedding vector(1536),
  match_threshold double precision,
  match_count integer,
  filter_user_id uuid,
  filter_space_id uuid default null
)
```

## Proposed API Changes

### Keep `POST /api/brain`

This remains the main interface.

Request:

```json
{
  "inputText": "Teach me from my brain: RAG",
  "userId": "uuid",
  "sessionId": "optional-session-id",
  "spaceId": "optional-space-id"
}
```

Response additions:

```json
{
  "type": "question",
  "response": "answer text",
  "knowledgeStatus": "partial",
  "knownPoints": ["..."],
  "missingPoints": ["..."],
  "saved": true,
  "memoryId": "uuid",
  "spaceId": "uuid",
  "topic": "RAG",
  "tags": ["rag", "embeddings"],
  "needsReview": false,
  "relationsCreated": 2
}
```

### Add `GET /api/spaces`

Returns spaces for the user.

Query:

```txt
/api/spaces?userId=<uuid>
```

### Add `POST /api/spaces`

Creates a new space.

Body:

```json
{
  "userId": "uuid",
  "name": "AI",
  "description": "AI and machine learning notes"
}
```

### Add `GET /api/memories`

Returns memory library data.

Query options:

- `userId`
- `spaceId`
- `topic`
- `status`
- `needsReview`

### Add `GET /api/graph`

Returns graph-ready nodes and edges.

Query options:

- `userId`
- `spaceId`
- `topic`

Response:

```json
{
  "nodes": [
    { "id": "topic:RAG", "type": "topic", "label": "RAG" }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "topic:RAG",
      "target": "topic:Embeddings",
      "type": "related_to",
      "strength": 0.8
    }
  ]
}
```

### Add `POST /api/weekly-summary`

Generates or returns weekly summary.

Body:

```json
{
  "userId": "uuid",
  "spaceId": "optional-space-id",
  "weekStart": "2026-06-22"
}
```

## Proposed Server Helpers

Create a focused memory intelligence module, for example:

```txt
src/lib/memoryIntelligence.ts
```

Suggested exported helpers:

- `normalizeTopicName(topic: string)`
- `normalizeTags(tags: string[])`
- `getDefaultSpaces(userId: string)`
- `ensureSpace(userId: string, name: string)`
- `searchRelatedMemories(inputText, userId, spaceId?)`
- `analyzeMemory(inputText, relatedMemories)`
- `detectMemoryRelations(inputText, relatedMemories)`
- `saveMemoryWithIntelligence(options)`
- `detectKnowledgeGap(question, relatedMemories)`
- `buildTeachModeResponse(topic, relatedMemories)`
- `generateWeeklyLearningSummary(options)`

Keep helpers testable:

- Pure parsing and normalization functions should not call Supabase.
- Gemini prompt functions should be isolated.
- Supabase persistence should be isolated.

## Gemini Prompt Requirements

All structured Gemini calls should ask for strict JSON.

### Memory Analysis Prompt

Input:

- new memory text
- optional related memories
- current space if selected

Output:

```json
{
  "title": "short title",
  "summary": "one sentence",
  "memoryType": "concept",
  "primaryTopic": "RAG",
  "tags": ["rag", "retrieval", "generation"],
  "suggestedSpace": "AI",
  "relatedTopics": ["embeddings", "vector search"],
  "confidenceSeed": 50
}
```

### Relation Detection Prompt

Input:

- new memory
- related memories

Output:

```json
{
  "relations": [
    {
      "targetMemoryId": "uuid",
      "relationType": "contradicts",
      "strength": 0.82,
      "reason": "The old memory says X, the new memory says Y."
    }
  ],
  "needsReview": true
}
```

### Knowledge Gap Prompt

Input:

- question/topic
- related memories

Output:

```json
{
  "status": "partial",
  "knownPoints": ["..."],
  "missingPoints": ["..."],
  "suggestedNextSteps": ["..."]
}
```

### Teach Mode Prompt

Input:

- topic
- known memories
- missing points

Output:

```json
{
  "knownFromYourBrain": ["..."],
  "gaps": ["..."],
  "lesson": "...",
  "examples": ["..."],
  "quiz": [
    {
      "question": "...",
      "expectedAnswer": "..."
    }
  ],
  "memoryToSave": "optional generated learning"
}
```

## Frontend Plan

The UI should stay chat-first.

### Phase UI Additions

1. Space selector
   - Add dropdown/select in the top header.
   - Default to `General` or most recently selected space.
   - Send `spaceId` with `/api/brain`.

2. Response badges
   - Display badges above or below assistant messages.
   - Example badges:
     - Known
     - Partial
     - New learning
     - Saved
     - Needs review
     - Contradiction

3. Memory insight panel
   - Add compact sidebar/panel below existing chat sessions or as a collapsible panel.
   - Show:
     - current space
     - due reviews
     - weak topics
     - recent topics
     - needs-review count

4. Graph view
   - Start simple.
   - Either a compact topic tree or a lightweight SVG/canvas graph.
   - Use `/api/graph`.

5. Weekly summary view
   - Add command support first.
   - Later add a button in the panel.

## Implementation Phases

## Phase 1: Database Foundation

Goal:

Add the schema needed for spaces, topics, relations, events, confidence, and weekly summaries.

Tasks:

- Create migration for new tables and memory columns.
- Add indexes for common filters:
  - memories by `user_id`, `space_id`, `created_at`
  - memories by `user_id`, `topic`
  - memories by `needs_review`
  - relations by `source_memory_id` and `target_memory_id`
  - events by `user_id`, `created_at`
- Seed default spaces for the hard-coded user.
- Update `match_memories` or add `match_memories_v2` with user and space filters.
- Keep old APIs working during migration.

Acceptance criteria:

- Existing memory save still works.
- Existing question answering still works.
- Default spaces exist.
- Existing memories can have null `space_id` but new memories should get one.
- No table migration breaks current chat sessions.

Tests:

- Run `npm run build`.
- Run `npm run lint`.
- Manually insert a test memory with new fields.
- Manually verify vector search still returns memories.
- Verify migration can run on a clean database and an existing database.

## Phase 2: Memory Intelligence Save Flow

Goal:

Refactor memory saving so all new memories receive metadata, confidence, relations, and event logs.

Tasks:

- Create `src/lib/memoryIntelligence.ts`.
- Move save logic out of `/api/brain` into helper functions.
- Add structured Gemini memory analysis.
- Add JSON parsing fallback for malformed Gemini responses.
- Add related memory search before save.
- Add relation detection for duplicates and contradictions.
- Save:
  - memory row
  - embedding row
  - topic row/link
  - relation rows
  - memory event rows
- Update direct `/api/addMemory` route to use the same helper or mark it as basic legacy insert.

Acceptance criteria:

- Saving a statement produces a memory with title, tags, topic, space, confidence, and event.
- Similar statements create relation rows.
- Contradictory statements create `contradicts` relation and `needs_review=true`.
- Failure to generate metadata should not block memory save; use safe defaults.
- Failure to save vectors should return `saved:false` but not crash the route.

Tests:

- Unit test tag normalization.
- Unit test topic normalization.
- Unit test Gemini JSON parser fallback.
- API test normal memory save.
- API test duplicate memory save.
- API test contradiction memory save.
- Manual chat test: save a normal fact and confirm assistant says it was saved.

## Phase 3: Knowledge Gap Detector

Goal:

Upgrade questions so the app can say whether the user knows, partially knows, or does not know a topic.

Tasks:

- Detect knowledge-gap prompts:
  - `Do I know about X?`
  - `Have I learned X?`
  - `What are my gaps in X?`
  - `Do I understand X?`
- Search related memories by vector, topic, tags, and space.
- Add `detectKnowledgeGap`.
- Return structured metadata from `/api/brain`.
- Update assistant prompt to answer from user memory first.
- If unknown, generate an answer and save it as AI-generated learning with lower confidence.

Acceptance criteria:

- Known topic returns `knowledgeStatus: known`.
- Partial topic returns `knowledgeStatus: partial` and missing points.
- Unknown topic returns `knowledgeStatus: unknown`, teaches the basics, and saves generated learning.
- The response distinguishes user's saved knowledge from new AI explanation.

Tests:

- Unit test prompt intent detection.
- API test known topic.
- API test partial topic.
- API test unknown topic.
- Manual chat test with `Do I know about RAG?`.

## Phase 4: Teach Me From My Brain Mode

Goal:

Create a mode that teaches a topic using saved memories first, then fills gaps.

Tasks:

- Detect teach commands:
  - `Teach me from my brain: X`
  - `Teach me what I know about X`
  - `Teach me from my saved notes about X`
- Reuse knowledge gap detector.
- Build a structured teach response:
  - what you already know
  - missing pieces
  - lesson
  - examples
  - quiz
  - memory update suggestion
- Save new generated learning if it fills a real gap.
- Mark generated learning as lower confidence.

Acceptance criteria:

- Teach mode works even with no memories.
- Teach mode prioritizes saved memories when they exist.
- Teach mode returns a quiz.
- Generated gap-filling content is saved and tagged.
- Confidence for generated learning is lower than user-provided memory.

Tests:

- Unit test teach command parsing.
- API test teach mode with known topic.
- API test teach mode with partial topic.
- API test teach mode with unknown topic.
- Manual test: `Teach me from my brain: embeddings`.

## Phase 5: Chat UI Intelligence

Goal:

Expose the new intelligence features in the existing chat-first UI.

Tasks:

- Load spaces on page load.
- Add active space state.
- Send `spaceId` with chat requests.
- Add response metadata to frontend message type.
- Render badges for:
  - saved
  - known
  - partial
  - unknown
  - needs review
  - contradiction
- Add compact memory insight panel.
- Keep mobile layout clean.

Acceptance criteria:

- User can choose a space.
- New memories are saved into the selected space.
- Assistant messages show correct badges.
- Needs-review and contradiction states are visible.
- UI works on desktop and mobile.

Tests:

- Manual UI test saving memory in each default space.
- Manual UI test question response with known/partial badge.
- Manual UI test contradiction response.
- Run `npm run lint`.
- Run `npm run build`.

## Phase 6: Concept Map / Learning Graph

Goal:

Show how topics and memories connect.

Tasks:

- Add `/api/graph`.
- Return nodes and edges from topics, memory links, and relations.
- Add graph or topic tree UI.
- Start with simple visual structure before advanced graph interactions.
- Filter by active space.

Acceptance criteria:

- Graph API returns non-empty nodes for a space with memories.
- Related topics are connected.
- Contradictions are visually distinguishable.
- Graph does not break when there are no memories.

Tests:

- API test graph with no data.
- API test graph with related topics.
- API test graph with contradiction relation.
- Manual UI test graph renders for a populated space.
- Manual mobile test.

## Phase 7: Weekly Learning Summary

Goal:

Generate useful weekly learning summaries.

Tasks:

- Add `/api/weekly-summary`.
- Detect weekly summary chat commands.
- Query memories, events, confidence, and relations for selected week.
- Generate summary with Gemini.
- Save or update weekly summary record.
- Add UI button or panel section for weekly summary.

Acceptance criteria:

- Weekly summary can be generated from chat.
- Summary includes new memories, top topics, weak topics, contradictions, and next steps.
- Summary can be scoped to a space.
- Re-running the same week updates or returns the existing summary.

Tests:

- API test empty week.
- API test week with several memories.
- API test week with needs-review memories.
- API test space-specific summary.
- Manual chat test: `weekly summary`.

## Phase 8: Testing Infrastructure

Goal:

Add a reliable test setup so future features can be implemented safely.

Tasks:

- Add Vitest for unit tests.
- Add test scripts:
  - `npm test`
  - `npm run test:watch`
- Create tests for pure helpers first.
- Add API route tests where practical.
- Consider Playwright later for full UI flows.

Acceptance criteria:

- `npm test` runs locally.
- Core helper functions are covered.
- At least one API behavior is covered with mocks.
- `npm run lint` and `npm run build` remain clean.

Tests:

- Run `npm test`.
- Run `npm run lint`.
- Run `npm run build`.

## Phase 9: Review Workflow and Polish

Goal:

Make duplicates, contradictions, and weak memories actionable.

Tasks:

- Add memory review panel or route.
- Show memories with `needs_review=true`.
- Allow future actions:
  - mark reviewed
  - merge memories
  - archive memory
  - resolve contradiction
  - update confidence
- For first version, at least show the queue and explain why each item needs review.

Acceptance criteria:

- Needs-review memories can be listed.
- Contradiction reason is visible.
- Duplicate relation reason is visible.
- User can identify which memories need cleanup.

Tests:

- API test needs-review filter.
- Manual UI test review queue.
- Manual test contradiction visibility.

## Phase Dependencies

Recommended order:

1. Phase 1: Database Foundation
2. Phase 2: Memory Intelligence Save Flow
3. Phase 3: Knowledge Gap Detector
4. Phase 4: Teach Me From My Brain Mode
5. Phase 5: Chat UI Intelligence
6. Phase 6: Concept Map / Learning Graph
7. Phase 7: Weekly Learning Summary
8. Phase 8: Testing Infrastructure
9. Phase 9: Review Workflow and Polish

Important dependency notes:

- Do not build graph before topics and relations exist.
- Do not build weekly summary before memory events exist.
- Do not build strong teach mode before knowledge gap detection exists.
- Do not build confidence UI before confidence fields exist.
- Do not build heavy dashboard UI before chat metadata is working.

## Suggested First Implementation Task

Start with Phase 1 only.

Concrete first task:

1. Create a new Supabase migration.
2. Add `spaces`, `memory_topics`, `memory_topic_links`, `memory_relations`, `memory_events`, and `weekly_summaries`.
3. Extend `memories` with space, topic, confidence, review, and updated timestamp fields.
4. Add indexes.
5. Add default spaces for the current hard-coded user.
6. Update or add a v2 memory match RPC.
7. Run build/lint.

Do not change UI in Phase 1 unless needed to keep the app working.

## Risks and Mitigations

### Gemini JSON Output Can Be Invalid

Mitigation:

- Add a safe JSON extraction helper.
- Fall back to simple title, `General` space, empty tags, and `new` confidence.

### Vector Search May Return Cross-User Memories

Mitigation:

- Update RPC to filter by user ID in the database, not only in TypeScript.

### Auto-Saving Contradictions Can Create Noise

Mitigation:

- Keep the chosen auto-save behavior.
- Mark contradictions with `needs_review=true`.
- Make the reason visible in review UI.

### Too Many Spaces or Tags Can Become Messy

Mitigation:

- Normalize tag names.
- Normalize topic names.
- Prefer existing space names when Gemini suggests similar ones.
- Fall back to `General`.

### Generated AI Memories May Pretend User Knows Something

Mitigation:

- Mark source as `gemini`.
- Start confidence lower than user-provided memories.
- In answers, distinguish saved user knowledge from generated explanation.

## Long-Term Improvements After This Plan

Not part of the first implementation, but useful later:

- Proper Supabase auth instead of hard-coded user ID.
- Full memory dashboard.
- Manual merge/archive/edit memory actions.
- Spaced repetition quiz mode.
- Import from Markdown, PDF, articles, or GitHub files.
- Export memory brain as Markdown or JSON.
- Real web search for current information.
- Stronger source citations.
- Per-space custom prompts.

## Definition of Done for the Full Feature Set

The implementation is complete when:

- New memories are automatically assigned spaces, topics, tags, confidence, and relations.
- Duplicate and contradiction detection works and marks review items.
- The app can tell whether the user knows, partially knows, or does not know a topic.
- Teach mode can teach from saved memories and fill gaps.
- The UI exposes spaces and response intelligence badges.
- Graph data shows topic and memory relationships.
- Weekly summaries can be generated and saved.
- Core helper logic has tests.
- `npm run lint` passes.
- `npm run build` passes.
