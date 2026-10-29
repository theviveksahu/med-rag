# Med-RAG

A public, no-login medical report analyser. Upload a text-based PDF, ask
questions, and get plain-language answers grounded only in that report.

**Not medical advice.** The app does not diagnose, recommend treatment, or
predict outcomes. Consult a clinician for medical decisions.

## What it does

- Extracts PDF text **in the browser** with `pdfjs-dist`. The PDF bytes never
  leave the device; only `{ page, text }` JSON is sent to the server.
- Chunks and embeds the extracted text into MongoDB Atlas and stores it under
  one anonymous session id.
- Uses a `deepagents` pipeline: plan → session-scoped Atlas search → chunk
  analysts → synthesis.
- Streams only safe answer text plus visible search/analyst activity. Private
  reasoning, raw chunks, citations, and file tools are filtered out server-side.
- Deletes the session and chunks on refresh, tab close, “Analyze another,” or
  “New session.” A short 30-minute Atlas TTL catches a failed unload request.

There is no login, dashboard, chat history, sample report, or structured metric
extraction. Answers are report-grounded and never include citations.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, AI SDK 7,
`deepagents`/LangChain, MongoDB Atlas Vector Search, OpenRouter free models.

## Limits

| Limit                         | Value                              |
| ----------------------------- | ---------------------------------- |
| PDF size                      | 25 MB                              |
| Pages                         | 30                                 |
| Extracted text                | 1,000,000 characters               |
| Chunks                        | 200                                |
| Upload JSON body              | 4,000,000 bytes                    |
| Chat messages per request     | 40                                 |
| Retrieval sections per search | 4                                  |
| Searches per turn             | 3                                  |
| Session TTL                   | 30 minutes (crash-safety backstop) |

Scanned PDFs, password-protected PDFs, and non-PDF files are rejected. There is
no OCR.

## Local setup

Requirements: Node.js 22+ and a MongoDB Atlas cluster with Vector Search.

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create `.env.local` from `.env.example` and fill in the Atlas URI and
   OpenRouter key. Never commit `.env.local`.

3. Create the Atlas collections/indexes once:

   ```bash
   npm run setup:db
   ```

   This creates the regular/TTL indexes and the `vector_index` used by
   `MongoDBAtlasVectorSearch`. Verify `vector_index` is `READY` in Atlas.

4. Start the app:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>.

The `postinstall`/`predev`/`prebuild` scripts copy the pdf.js worker and CMaps
into gitignored `public/pdfjs/`.

## Environment variables

| Variable                                 | Required | Notes                                                |
| ---------------------------------------- | -------- | ---------------------------------------------------- |
| `MONGODB_ATLAS_URI`                      | yes      | Atlas connection string                              |
| `MONGODB_ATLAS_DB_NAME`                  | yes      | Database name                                        |
| `MONGODB_ATLAS_COLLECTION_NAME`          | no       | Defaults to `chunks`                                 |
| `MONGODB_ATLAS_SESSIONS_COLLECTION_NAME` | no       | Defaults to `sessions`                               |
| `OPENROUTER_API_KEY`                     | yes      | Server-only                                          |
| `CHAT_MODEL`                             | no       | Defaults to `nvidia/nemotron-3-ultra-550b-a55b:free` |
| `ANALYST_MODEL`                          | no       | Defaults to `CHAT_MODEL`                             |
| `EMBEDDING_MODEL`                        | no       | Defaults to `nvidia/nemotron-3.5-embed-8b:free`      |

Use free OpenRouter models only. The demo has no passcode or global daily cap;
if the provider returns a daily free-quota 429, the UI shows the honest quota
message.

## Scripts

| Command                       | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `npm run dev`                 | Local dev server                             |
| `npm run build` / `npm start` | Production build and server                  |
| `npm run lint`                | ESLint                                       |
| `npm run typecheck`           | `tsc --noEmit`                               |
| `npm test`                    | Vitest unit/integration tests                |
| `npm run test:watch`          | Vitest watch mode                            |
| `npm run test:e2e`            | Playwright happy path (mocks all API routes) |
| `npm run setup:db`            | Create Atlas indexes                         |
| `npm run make:test-pdf`       | Generate the synthetic 2-page test PDF       |

## Testing

- **Unit/integration:** Vitest + jsdom + Testing Library. Covers schemas, text
  normalization, chunking, session lifecycle, provider-error mapping, PII
  redaction, PDF validation, upload state, formatting, and chat rendering.
- **End-to-end:** one Playwright happy path in
  `tests/e2e/upload-chat.spec.ts`. It uses a generated synthetic PDF, mocks
  `/api/upload`, `/api/chat`, and `/api/session/end`, and asserts that only
  extracted text is uploaded. `tests/e2e/mobile.spec.ts` adds a 390 px
  no-horizontal-overflow check for Upload and Chat.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, tests, build, and the
  Playwright path on every push and pull request.

The local macOS 12 machine cannot download Playwright’s bundled Chromium; the
config uses installed Google Chrome locally and bundled Chromium in CI.

## Privacy and security

- PDF parsing happens client-side. The upload route accepts JSON text only and
  enforces a 4 MB body cap.
- Session ids are anonymous client-generated UUIDs stored in `sessionStorage`.
  They are bearer secrets; the UI never logs them.
- Every vector search is pre-filtered by the server-held `sessionId`. The model
  cannot choose another session.
- Report header PII is redacted at the model boundary. Stored chunk text remains
  intact; retrieved previews and tool outputs are redacted.
- Answers are streamed through a server-side allow-list. Reasoning, raw chunks,
  `read_file`, source/file parts, and provider errors never reach the browser.
- `.env.local`, `private/`, and generated test PDFs are gitignored. The real
  report must never be committed or logged.

## Deployment (Vercel + Atlas)

1. Create a Vercel Hobby project and connect the repo. Use Node 22 and one region
   near the Atlas cluster (Hobby defaults to `iad1`).
2. Add the environment variables from `.env.example` in the Vercel dashboard.
3. Create an Atlas M0 cluster and a dedicated `readWrite` database user. Allow
   `0.0.0.0/0` because Hobby has no static egress IPs; keep a strong password.
4. Run `npm run setup:db` once against the production URI. Confirm
   `vector_index` includes the `sessionId` filter field and is `READY`.
5. Deploy. The API routes use the Node.js runtime and `maxDuration = 300`.
6. Smoke-test: upload a synthetic >4.5 MB text PDF, ask a question, verify the
   network panel shows no PDF bytes, refresh, and confirm the session is gone.

**Rollback:** promote the previous Vercel deployment. Atlas changes are additive
(indexes/TTL), so rolling back the app does not require a database rollback. If
a bad deploy wrote unexpected chunks, run `npm run setup:db -- --clean` only
after confirming it is safe to remove legacy chunk documents.

Atlas free tier auto-pauses after inactivity; the first request after a pause
may be slower.

## Project map

| Path                               | Role                                           |
| ---------------------------------- | ---------------------------------------------- |
| `src/app/page.tsx`                 | Upload → Processing → Chat state machine       |
| `src/app/api/upload/route.ts`      | Validate text JSON, dedupe/replace, ingest     |
| `src/app/api/chat/route.ts`        | Session validation, agent stream, sanitization |
| `src/app/api/session/end/route.ts` | Idempotent best-effort deletion                |
| `src/lib/client/extract-pdf.ts`    | Browser PDF extraction and limits              |
| `src/lib/server/ingest.ts`         | Hash, chunk, embed, insert                     |
| `src/lib/server/search-tool.ts`    | Session-scoped Atlas search                    |
| `src/lib/server/agent.ts`          | deepagents wiring and analyst subagents        |
| `src/lib/server/redact.ts`         | Header PII redaction at model boundary         |
| `src/lib/shared/`                  | Limits, errors, schemas, types, normalization  |

## License

Private project; no license granted.
