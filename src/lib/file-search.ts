import { showToast, Toast } from "@raycast/api";
import type {
  Document,
  DocumentState,
  FileSearchStore,
  UploadToFileSearchStoreOperation,
  UploadToFileSearchStoreParameters,
} from "@google/genai";
import { getExtensionPreferences } from "./preferences";
import { getGoogleClient } from "./google-client";
import { replaceDocuments, setFileSearchStoreId, getFileSearchStoreId } from "./cache";
import type { StoredDocument, UploadStatus } from "./types";

interface CreateStoreResult {
  id: string;
  name: string;
}

function parseStoreName(store: FileSearchStore | string): CreateStoreResult {
  if (typeof store === "string") {
    const id = store.split("/").pop() ?? store;
    return { id, name: store };
  }

  const name = store.name;
  const id = name.split("/").pop() ?? name;
  return { id, name };
}

export async function ensureFileSearchStore(): Promise<CreateStoreResult> {
  const cachedId = await getFileSearchStoreId();

  if (cachedId) {
    return { id: cachedId, name: `fileSearchStores/${cachedId}` };
  }

  const client = getGoogleClient();
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Creating File Search store",
  });

  try {
    const { storeDisplayName } = getExtensionPreferences();
    const store = await client.fileSearchStores.create({
      config: {
        displayName: storeDisplayName || "Great Library",
      },
    });

    const { id, name } = parseStoreName(store);
    await setFileSearchStoreId(id);

    toast.title = "File Search store ready";
    toast.style = Toast.Style.Success;

    return { id, name };
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to create File Search store";
    toast.message = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

export async function uploadFileToStore(
  input: UploadToFileSearchStoreParameters,
): Promise<UploadToFileSearchStoreOperation> {
  const client = getGoogleClient();
  return client.fileSearchStores.uploadToFileSearchStore(input);
}

export async function waitForUploadCompletion(
  operation: UploadToFileSearchStoreOperation,
  onTick?: (op: UploadToFileSearchStoreOperation) => void,
): Promise<UploadToFileSearchStoreOperation> {
  let current = operation;
  const client = getGoogleClient();

  while (!current.done) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    current = (await client.operations.get({ operation: current })) as UploadToFileSearchStoreOperation;
    onTick?.(current);
  }

  if (current.error) {
    throw new Error(`Upload failed: ${JSON.stringify(current.error)}`);
  }

  return current;
}

export async function fetchDocumentsFromStore(): Promise<StoredDocument[]> {
  const { name } = await ensureFileSearchStore();
  const client = getGoogleClient();
  const pager = await client.fileSearchStores.documents.list({ parent: name, config: { pageSize: 20 } });
  const documents: StoredDocument[] = [];

  for await (const doc of pager) {
    documents.push(mapDocument(doc));
  }

  await replaceDocuments(documents);
  return documents;
}

function mapDocument(document: Document): StoredDocument {
  const id = document.name ? (document.name.split("/").pop() ?? document.name) : `doc-${Date.now()}`;
  return {
    id,
    name: document.displayName || document.name || "Untitled Document",
    uploadDate: document.createTime ?? new Date().toISOString(),
    size: document.sizeBytes ? Number(document.sizeBytes) : 0,
    status: mapDocumentState(document.state),
    metadata: document.customMetadata?.reduce<Record<string, string>>((acc, entry) => {
      if (entry.key && entry.stringValue) {
        acc[entry.key] = entry.stringValue;
      }
      return acc;
    }, {}),
  };
}

function mapDocumentState(state?: DocumentState): UploadStatus {
  switch (state) {
    case "STATE_ACTIVE":
      return "indexed";
    case "STATE_PENDING":
      return "processing";
    case "STATE_FAILED":
      return "error";
    default:
      return "pending";
  }
}
