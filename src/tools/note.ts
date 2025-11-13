import { randomUUID } from "node:crypto";
import { writeFile, unlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_FILE_SIZE_BYTES, findOversizedFile, uploadFilesToLibrary, UploadableFile } from "../lib/upload";
import type { UploadStatus } from "../lib/types";

type NoteToolInput = {
  /**
   * Optional title that will be used as the document display name.
   */
  title?: string;
  /**
   * Body of the note to store in the Great Library.
   */
  content: string;
};

type NoteToolResult = {
  /**
   * ID of the stored note document.
   */
  noteId: string;
  /**
   * Title associated with the stored note.
   */
  title: string;
  /**
   * Size of the uploaded document in bytes.
   */
  size: number;
  /**
   * Upload status reported by the Great Library cache.
   */
  status: UploadStatus;
};

/**
 * Create a note document and upload it to the Great Library.
 */
export default async function noteTool(input: NoteToolInput): Promise<NoteToolResult> {
  const trimmedContent = input?.content?.trim();
  if (!trimmedContent) {
    throw new Error("Provide the note content to upload.");
  }

  const title = input?.title?.trim() || "Untitled Note";
  const slug = buildSlug(title);
  const uniqueId = randomUUID().split("-")[0];
  const fileName = `${slug}-${uniqueId}.md`;
  const filePath = join(tmpdir(), fileName);
  const fileContents = formatNoteContent(title, trimmedContent);
  const estimatedSize = Buffer.byteLength(fileContents, "utf8");

  if (estimatedSize > MAX_FILE_SIZE_BYTES) {
    throw new Error("Note content exceeds the 100 MB limit enforced by Google File Search.");
  }

  await writeFile(filePath, fileContents, "utf8");

  try {
    const fileStats = await stat(filePath);
    const uploadable: UploadableFile = {
      path: filePath,
      name: title,
      size: fileStats.size,
      mimeType: "text/markdown",
    };

    const oversizeFile = findOversizedFile([uploadable]);
    if (oversizeFile) {
      throw new Error(`${oversizeFile.name} exceeds the 100 MB limit enforced by Google File Search.`);
    }

    const { documents } = await uploadFilesToLibrary([uploadable]);
    const [document] = documents;

    if (!document) {
      throw new Error("The note was not stored successfully.");
    }

    return {
      noteId: document.id,
      title: document.name,
      size: document.size,
      status: document.status,
    };
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}

function buildSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return slug || "note";
}

function formatNoteContent(title: string, content: string): string {
  if (!title || title === "Untitled Note") {
    return `${content}\n`;
  }

  return `# ${title}\n\n${content}\n`;
}
