import { Action, ActionPanel, Color, Icon, LaunchType, List, Toast, launchCommand, showToast } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { fetchDocumentsFromStore } from "./lib/file-search";
import { getDocuments } from "./lib/cache";
import type { StoredDocument, UploadStatus } from "./lib/types";
import { formatBytes } from "./lib/format";

export default function ListFilesCommand() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadFromCache = useCallback(async () => {
    try {
      const cached = await getDocuments();
      setDocuments(cached);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshFromRemote = useCallback(async () => {
    setIsRefreshing(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Syncing with Google File Search",
    });

    try {
      const remoteDocs = await fetchDocumentsFromStore();
      setDocuments(remoteDocs);
      toast.title = "Documents synced";
      toast.style = Toast.Style.Success;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Sync failed";
      toast.message = error instanceof Error ? error.message : String(error);
      console.error(error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFromCache().then(() => {
      refreshFromRemote().catch((error) => console.error(error));
    });
  }, [loadFromCache, refreshFromRemote]);

  return (
    <List isLoading={isLoading || isRefreshing} searchBarPlaceholder="Filter documents..." isShowingDetail={false}>
      {documents.length === 0 ? (
        <List.EmptyView
          icon={Icon.Tray}
          title="No documents yet"
          description="Upload files to build your library."
          actions={
            <ActionPanel>
              <Action title="Upload Files" icon={Icon.ArrowUpTray} onAction={openUploadCommand} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refreshFromRemote} />
            </ActionPanel>
          }
        />
      ) : (
        documents.map((doc) => (
          <List.Item
            key={doc.id}
            title={doc.name}
            subtitle={formatBytes(doc.size)}
            accessories={[getStatusAccessory(doc.status), { date: new Date(doc.uploadDate) }]}
            actions={
              <ActionPanel>
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refreshFromRemote} />
                <Action title="Upload More Files" icon={Icon.ArrowUpTray} onAction={openUploadCommand} />
                <Action.CopyToClipboard title="Copy Document ID" content={doc.id} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

function getStatusAccessory(status: UploadStatus) {
  switch (status) {
    case "indexed":
      return { tag: { value: "Indexed", color: Color.Green } };
    case "processing":
    case "uploading":
      return { tag: { value: "Processing", color: Color.Yellow } };
    case "error":
      return { tag: { value: "Error", color: Color.Red } };
    default:
      return { tag: { value: "Pending", color: Color.SecondaryText } };
  }
}

async function openUploadCommand() {
  await launchCommand({ name: "upload-files", type: LaunchType.UserInitiated });
}
