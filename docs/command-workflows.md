# Great Library Command Workflows

This note walks through the three Raycast commands (`Ask`, `List Files`, and `Upload Files`) from a handoff perspective. Start with the shared plumbing, then drill into each command’s lifecycle so the next agent can reason about changes quickly.

## Shared Building Blocks
- **Google client & store selection**: `ensureFileSearchStore` enumerates File Search stores and reuses the one whose `displayName` matches the Raycast preference, creating a new store only when none exist (`src/lib/file-search.ts:27-153`). The preference value defaults to “Great Library” but can be overridden in the extension settings (`src/lib/preferences.ts:11-21`).
- **Document cache**: Indexed documents are cached in Raycast `LocalStorage` via `getDocuments`, `upsertDocuments`, and `replaceDocuments` (`src/lib/cache.ts:51-77`). The cache accelerates UI loads but always syncs against Google when requested.
- **Gemini model configuration**: All generate calls use `gemini-2.5-flash`, which supports File Search tool grounding (`src/lib/constants.ts:1`).
- **Logging**: Every command emits structured `console.log` lines prefixed with `[AskIt]`, `[UploadFiles]`, or similar, capturing store metadata, request payload sizes, and grounding diagnostics (`src/ask-it.tsx:51-124`, `src/upload-files-command.tsx:75-123`).

## Upload Files Command
1. **Prepare selection** – The form watches the file picker, memoizes the sorted selection, and reads metadata (size, mime type) before upload (`src/upload-files-command.tsx:37-47`, `src/upload-files-command.tsx:159-180`).
2. **Validate & resolve store** – On submit, the command validates file count and size, then calls `ensureFileSearchStore` to log and reuse the shared store (`src/upload-files-command.tsx:49-83`).
3. **Upload each file** – Files are uploaded sequentially through `uploadFileToStore`, which wraps `fileSearchStores.uploadToFileSearchStore`. The operation is polled until completion via `waitForUploadCompletion`, which repeatedly calls `operations.get({ operation })` until `done` is true (`src/upload-files-command.tsx:84-107`, `src/lib/file-search.ts:61-87`).
4. **Update cache & UI** – Completed uploads push basic document metadata into `LocalStorage` with `upsertDocuments`, reset the picker state, and surface toast success or failure (`src/upload-files-command.tsx:109-124`).

**Operational notes**
- Upload failures bubble up through toasts and logs; partial successes are not committed, so retry re-uploads the entire batch.
- Display names on uploaded documents follow the original file name so grounding snippets reference user-facing titles.

## List Files Command
1. **Warm cache** – On launch the command hydrates the document list from `LocalStorage` to avoid a blank UI (`src/list-files-command.tsx:10-23`).
2. **Sync with Google** – Immediately after, `fetchDocumentsFromStore` lists documents from the active File Search store and replaces the cache; manual refresh re-runs the same fetch (`src/list-files-command.tsx:25-48`, `src/lib/file-search.ts:89-101`).
3. **Render status** – Each list item shows size, upload time, and a status tag derived from the File Search document state (`src/list-files-command.tsx:50-103`). Actions let the user refresh or open the upload command.

**Operational notes**
- Because document states can linger in `STATE_PENDING`, the status tag exposes on-going processing so users can retry Ask once indexing completes.

## Ask Command
1. **Conversation setup** – Command state maintains the current question list (`entries`) and the Gemini conversation payload (`conversation`). Cached documents are loaded on mount for context summaries (`src/ask-it.tsx:31-42`).
2. **Question submission** – `handleAsk` enqueues a pending entry, resolves the File Search store, and prepares the Gemini history with the latest user question (`src/ask-it.tsx:44-83`).
3. **Model call** – The command calls `models.generateContent` with the File Search tool configured to target the active store (`src/ask-it.tsx:84-96`). Logging captures question size, tool usage, and candidate statistics.
4. **Response handling** – The first candidate’s text is extracted, citations are mapped against the cached documents, and grounding chunks are logged for debugging. Conversation history is trimmed to 10 messages to stay within token limits (`src/ask-it.tsx:98-149`).
5. **UI update** – Entries transition from pending to success or error, with answers rendered in the list detail view. Clipboard and follow-up actions use the existing entry state (`src/ask-it.tsx:135-207`).

**Operational notes**
- Grounding diagnostics surface `doc` and `snippetPreview` data; if those fields are empty, inspect the logged `groundingChunks` object to adjust parsing (`src/ask-it.tsx:108-123`).
- The command does not persist conversation history; relaunching starts a fresh session.

## Handoff Checklist
1. Confirm the Raycast preferences include a `store-display-name` shared across commands.
2. Run Upload → List → Ask sequentially to verify the shared File Search store is reused and logs report consistent IDs.
3. When modifying the File Search integration, touch `ensureFileSearchStore` first—changes there affect all three commands simultaneously.
