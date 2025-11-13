import { Action, ActionPanel, Form, LaunchProps, Toast, showToast } from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureFileSearchStore, uploadFileToStore, waitForUploadCompletion } from "./lib/file-search";
import { upsertDocuments } from "./lib/cache";
import type { StoredDocument } from "./lib/types";
import { stat } from "node:fs/promises";
import { lookup as mimeLookup } from "mime-types";
import { formatBytes } from "./lib/format";

type FormValues = {
  files?: string[];
};

type UploadFile = {
  path: string;
  name: string;
  size: number;
  mimeType: string;
};

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export default function UploadFilesCommand({ launchContext }: LaunchProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSelectionSignature, setLastSelectionSignature] = useState<string>("");
  const lastSelectionRef = useRef<string>("");

  useEffect(() => {
    setFiles([]);
    setLastSelectionSignature("");
    lastSelectionRef.current = "";
  }, [launchContext]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const handleSelectionChange = useCallback(async (selectedPaths: string[] | undefined) => {
    const paths = selectedPaths ?? [];
    const signature = [...paths].sort().join("|");
    setLastSelectionSignature(signature);
    lastSelectionRef.current = signature;

    const metadata = await readFilesMetadata(paths);
    if (lastSelectionRef.current === signature) {
      setFiles(metadata);
    }
  }, []);

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Preparing upload",
      });

      try {
        setIsUploading(true);
        const selectedPaths = values.files ?? [];
        const currentSignature = [...selectedPaths].sort().join("|");

        let selectedFiles = files;
        if (!selectedFiles.length || currentSignature !== lastSelectionSignature) {
          selectedFiles = await readFilesMetadata(selectedPaths);
        }

        if (selectedFiles.length === 0) {
          throw new Error("Please pick at least one file.");
        }

        const oversizeFile = selectedFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);
        if (oversizeFile) {
          throw new Error(`${oversizeFile.name} exceeds the 100 MB limit enforced by Google File Search.`);
        }

        const { id: storeId, name: storeName, displayName: storeDisplayName } = await ensureFileSearchStore();
        console.log("[UploadFiles] Using file search store", {
          storeId,
          storeName,
          storeDisplayName: storeDisplayName ?? "(no display name)",
        });
        toast.title = "Uploading files";
        toast.message = `${selectedFiles.length} file(s)`;

        const uploadedDocs: StoredDocument[] = [];

        for (const file of selectedFiles) {
          toast.message = `Uploading ${file.name}`;
          const operation = await uploadFileToStore({
            fileSearchStoreName: storeName,
            file: file.path,
            config: {
              displayName: file.name,
              mimeType: file.mimeType,
            },
          });

          const completedOperation = await waitForUploadCompletion(operation);
          const documentId = parseDocumentId(completedOperation.response?.documentName ?? completedOperation.name);

          uploadedDocs.push({
            id: documentId,
            name: file.name,
            uploadDate: new Date().toISOString(),
            size: file.size,
            status: "indexed",
          });
        }

        await upsertDocuments(uploadedDocs);

        toast.style = Toast.Style.Success;
        toast.title = "Upload complete";
        toast.message = `${uploadedDocs.length} file(s) ready`;
        setFiles([]);
        setLastSelectionSignature("");
        lastSelectionRef.current = "";
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Upload failed";
        toast.message = error instanceof Error ? error.message : String(error);
        console.error(error);
      } finally {
        setIsUploading(false);
      }
    },
    [files, lastSelectionSignature],
  );

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Upload" onSubmit={handleSubmit} disabled={isUploading} />
        </ActionPanel>
      }
      isLoading={isUploading}
    >
      <Form.FilePicker
        id="files"
        title="Documents"
        allowMultipleSelection
        info="Select one or more files (max 100 MB each)."
        onChange={handleSelectionChange}
      />
      {files.length > 0 ? (
        <>
          <Form.Description title="Selected Files" text={`${files.length} file(s), ${formatBytes(totalSize)}`} />
          {files.map((file) => (
            <Form.Description key={file.path} title={file.name} text={formatBytes(file.size)} />
          ))}
        </>
      ) : (
        <Form.Description title="Need Help?" text="Add PDFs, docs, or text files to index them for Q&A." />
      )}
    </Form>
  );
}

async function readFilesMetadata(paths: string[]): Promise<UploadFile[]> {
  const metadata: UploadFile[] = [];

  for (const path of paths) {
    try {
      const stats = await stat(path);
      if (!stats.isFile()) {
        continue;
      }

      metadata.push({
        path,
        name: path.split("/").pop() ?? path,
        size: stats.size,
        mimeType: (mimeLookup(path) || "application/octet-stream") as string,
      });
    } catch (error) {
      console.warn("Unable to read file metadata", path, error);
    }
  }

  return metadata;
}

function parseDocumentId(documentName: string): string {
  return documentName.split("/").pop() ?? documentName;
}
