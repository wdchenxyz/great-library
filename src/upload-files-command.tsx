import { Action, ActionPanel, Form, LaunchProps, Toast, showToast } from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_FILE_SIZE_BYTES,
  UploadableFile,
  findOversizedFile,
  readFilesMetadata,
  uploadFilesToLibrary,
} from "./lib/upload";
import { formatBytes } from "./lib/format";

type FormValues = {
  files?: string[];
};

export default function UploadFilesCommand({ launchContext }: LaunchProps) {
  const [files, setFiles] = useState<UploadableFile[]>([]);
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

        const oversizeFile = findOversizedFile(selectedFiles);
        if (oversizeFile) {
          throw new Error(`${oversizeFile.name} exceeds the 100 MB limit enforced by Google File Search.`);
        }

        toast.title = "Uploading files";
        toast.message = `${selectedFiles.length} file(s)`;

        const { documents: uploadedDocs } = await uploadFilesToLibrary(selectedFiles, {
          onProgressUpdate: (file) => {
            toast.message = `Uploading ${file.name}`;
          },
        });

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
          <Action.SubmitForm title="Upload" onSubmit={handleSubmit} />
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
