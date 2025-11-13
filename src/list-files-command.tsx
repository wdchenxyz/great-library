import { Action, ActionPanel, Icon, LaunchType, List, launchCommand } from "@raycast/api";
import { formatBytes } from "./lib/format";
import { useDocumentList } from "./hooks/useDocumentList";
import { getStatusAccessory } from "./utils/ui-helpers";

export default function ListFilesCommand() {
  const { documents, isLoading, isRefreshing, refresh } = useDocumentList();

  const openUploadCommand = async () => {
    await launchCommand({ name: "upload-files", type: LaunchType.UserInitiated });
  };

  return (
    <List
      isLoading={isLoading || isRefreshing}
      searchBarPlaceholder="Filter documents..."
      isShowingDetail={false}
      navigationTitle="Great Library Documents"
    >
      {documents.length === 0 ? (
        <List.EmptyView
          icon={Icon.Tray}
          title="No documents yet"
          description="Upload files to build your library."
          actions={
            <ActionPanel>
              <Action
                title="Upload Files"
                icon={Icon.ArrowUpCircle}
                onAction={openUploadCommand}
              />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                onAction={refresh}
              />
            </ActionPanel>
          }
        />
      ) : (
        documents.map((doc) => (
          <List.Item
            key={doc.id}
            title={doc.name}
            subtitle={formatBytes(doc.size)}
            accessories={[
              getStatusAccessory(doc.status),
              { date: new Date(doc.uploadDate) }
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  onAction={refresh}
                />
                <Action
                  title="Upload More Files"
                  icon={Icon.ArrowUpCircle}
                  onAction={openUploadCommand}
                />
                <Action.CopyToClipboard
                  title="Copy Document ID"
                  content={doc.id}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}