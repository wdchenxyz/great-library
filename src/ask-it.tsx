import { Action, ActionPanel, Clipboard, Icon, List, Toast, showToast } from "@raycast/api";
import type { Content } from "@google/genai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { randomUUID } from "node:crypto";
import { getDocuments } from "./lib/cache";
import {
  buildAskHistory,
  CitationEntry,
  DEFAULT_MAX_CONTEXT_MESSAGES,
  describeGroundingChunk,
  runAskFlow,
  truncate,
} from "./lib/ask";
import type { StoredDocument } from "./lib/types";

type QaEntry = {
  id: string;
  question: string;
  status: "pending" | "ready" | "error";
  answer?: string;
  error?: string;
  citations: CitationEntry[];
  createdAt: string;
};

const MAX_CONTEXT_MESSAGES = DEFAULT_MAX_CONTEXT_MESSAGES;

export default function AskItCommand() {
  const [searchText, setSearchText] = useState<string>("");
  const [entries, setEntries] = useState<QaEntry[]>([]);
  const [conversation, setConversation] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);

  useEffect(() => {
    getDocuments()
      .then(setDocuments)
      .catch((error) => console.error("Failed to load cached documents", error));
  }, []);

  const handleAsk = useCallback(
    async (input?: string) => {
      const question = (input ?? searchText).trim();
      if (!question || isLoading) {
        return;
      }

      console.log("[AskIt] Asking question", { question, hasInput: Boolean(input) });

      const entryId = randomUUID();
      const createdAt = new Date().toISOString();
      setEntries((prev) => [
        {
          id: entryId,
          question,
          status: "pending",
          citations: [],
          createdAt,
        },
        ...prev,
      ]);

      setIsLoading(true);
      const toast = await showToast({ style: Toast.Style.Animated, title: "Searching documents..." });

      try {
        const history = buildAskHistory(question, conversation);
        console.log("[AskIt] Sending request", {
          historyCount: history.length,
          latestUserQuestionLength: question.length,
          documentCount: documents.length,
        });

        const {
          answer,
          citations,
          metadata,
          modelContent,
          store,
          conversation: updatedConversation,
        } = await runAskFlow({
          question,
          conversation,
          history,
          documents,
          maxContextMessages: MAX_CONTEXT_MESSAGES,
        });
        console.log("[AskIt] Using file search store", {
          storeName: store.name,
          storeDisplayName: store.displayName ?? "(no display name)",
        });
        console.log("[AskIt] Received response", {
          answerPreview: answer ? `${answer.slice(0, 80)}${answer.length > 80 ? "…" : ""}` : null,
          citationCount: citations.length,
          groundingChunkCount: metadata?.groundingChunks?.length ?? 0,
          searchQueryCount: metadata?.webSearchQueries?.length ?? 0,
          toolCalls: modelContent?.parts?.filter((part) => part?.inlineData || part?.functionCall).length ?? 0,
        });
        if (metadata?.groundingChunks?.length) {
          console.log("[AskIt] Grounding chunks", metadata.groundingChunks.map(describeGroundingChunk));
        }
        if (citations.length) {
          console.log(
            "[AskIt] Citations",
            citations.map((citation) => ({
              documentId: citation.documentId,
              documentName: citation.documentName,
              snippetPreview: truncate(citation.snippet),
              uri: citation.uri,
            })),
          );
        }

        setConversation(updatedConversation);

        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  status: "ready",
                  answer: answer || "_The model returned no answer._",
                  citations,
                }
              : entry,
          ),
        );

        toast.style = Toast.Style.Success;
        toast.title = "Answer ready";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  status: "error",
                  error: message,
                }
              : entry,
          ),
        );
        toast.style = Toast.Style.Failure;
        toast.title = "Question failed";
        toast.message = message;
        console.error("Ask command failed", error);
      } finally {
        setIsLoading(false);
      }
    },
    [conversation, documents, isLoading, searchText],
  );

  const clearHistory = useCallback(() => {
    setEntries([]);
    setConversation([]);
  }, []);

  const latestEntry = entries[0];
  const placeholderDetail = useMemo(() => {
    if (!latestEntry) {
      return "Type a question into the search bar above and press ⏎ to run it against your indexed documents.";
    }
    if (latestEntry.status === "pending") {
      return `Searching for:\n\n> ${latestEntry.question}`;
    }
    if (latestEntry.status === "error") {
      return `⚠️ ${latestEntry.error ?? "The last question failed."}`;
    }
    return `Latest answer:\n\n${latestEntry.answer ?? "No data yet."}`;
  }, [latestEntry]);

  return (
    <List
      searchBarPlaceholder="Ask anything about your documents..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      isShowingDetail
      isLoading={isLoading}
      navigationTitle="Ask the Great Library"
    >
      <List.Section title="Prompt">
        <List.Item
          id="ask"
          icon={Icon.MagnifyingGlass}
          title={searchText.trim() || "Type your question"}
          subtitle={isLoading ? "Searching..." : "Press ⏎ to ask"}
          detail={<List.Item.Detail markdown={placeholderDetail} />}
          actions={
            <ActionPanel>
              <Action title="Ask Question" icon={Icon.MagnifyingGlass} onAction={() => handleAsk()} />
              <Action title="Ask" icon={Icon.MagnifyingGlass} onAction={() => handleAsk()} />
              {entries.length > 0 && (
                <Action
                  title="Clear History"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={clearHistory}
                />
              )}
            </ActionPanel>
          }
        />
      </List.Section>

      {entries.length > 0 && (
        <List.Section title="History">
          {entries.map((entry) => (
            <List.Item
              key={entry.id}
              id={entry.id}
              title={entry.question}
              accessories={[{ date: new Date(entry.createdAt) }]}
              icon={entry.status === "error" ? Icon.ExclamationMark : Icon.Document}
              subtitle={entry.status === "error" ? "Error" : undefined}
              detail={<List.Item.Detail markdown={getEntryMarkdown(entry)} metadata={getEntryMetadata(entry)} />}
              actions={
                <ActionPanel>
                  <Action
                    title="Copy Answer"
                    icon={Icon.Clipboard}
                    onAction={() => copyEntryAnswer(entry)}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action title="Copy Citations" icon={Icon.Clipboard} onAction={() => copyEntryCitations(entry)} />
                  <Action title="Ask Follow-Up" icon={Icon.Message} onAction={() => setSearchText("")} />
                  <Action
                    title="Ask Again"
                    icon={Icon.Repeat}
                    onAction={() => handleAsk(entry.question)}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                  />
                  <Action
                    title="Clear History"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={clearHistory}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function getEntryMarkdown(entry: QaEntry): string {
  if (entry.status === "pending") {
    return "_Searching documents..._";
  }
  if (entry.status === "error") {
    return `⚠️ ${entry.error ?? "Something went wrong."}`;
  }
  return entry.answer ?? "_No answer provided._";
}

function getEntryMetadata(entry: QaEntry) {
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Question" text={entry.question} />
      <List.Item.Detail.Metadata.Label title="Asked" text={new Date(entry.createdAt).toLocaleString()} />
      {entry.citations.length > 0 && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Citations" text="" />
          {entry.citations.map((citation) => (
            <List.Item.Detail.Metadata.Label
              key={citation.id}
              title={citation.documentName}
              text={truncate(citation.snippet)}
            />
          ))}
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

async function copyEntryAnswer(entry: QaEntry) {
  if (!entry.answer) {
    return;
  }
  await Clipboard.copy(entry.answer);
}

async function copyEntryCitations(entry: QaEntry) {
  if (!entry.citations.length) {
    return;
  }
  const payload = entry.citations
    .map((citation, index) => {
      const lines = [`${index + 1}. ${citation.documentName}${citation.documentId ? ` (${citation.documentId})` : ""}`];
      if (citation.snippet) {
        lines.push(`   “${citation.snippet}”`);
      }
      if (citation.uri) {
        lines.push(`   ${citation.uri}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  await Clipboard.copy(payload);
}
