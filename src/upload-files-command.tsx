import { Action, ActionPanel, Form, LaunchProps } from "@raycast/api";
import { useEffect } from "react";
import { MAX_FILE_SIZE_BYTES } from "./lib/upload";
import { formatBytes } from "./lib/format";
import { useFileUpload } from "./hooks/useFileUpload";

type FormValues = {
  files?: string[];
};

export default function UploadFilesCommand({ launchContext }: LaunchProps) {
  const { files, isUploading, totalSize, handleSelectionChange, uploadFiles, reset } = useFileUpload();

  // Reset state when launch context changes
  useEffect(() => {
    reset();
  }, [launchContext, reset]);

  // Handle form submission
  const handleSubmit = async (values: FormValues) => {
    const selectedPaths = values.files ?? [];
    await uploadFiles(selectedPaths);
  };

  // Helper text for the form
  const helperText = files.length > 0
    ? `${files.length} file(s) selected • ${formatBytes(totalSize)} total`
    : "Select files to upload to your Great Library";

  const description = `Upload documents to Google File Search for Q&A. Maximum file size: ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB per file.`;

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Upload"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
      isLoading={isUploading}
      navigationTitle="Upload Files to Great Library"
    >
      <Form.Description
        title="Upload Files"
        text={description}
      />

      <Form.FilePicker
        id="files"
        title="Files"
        allowMultipleSelection={true}
        canChooseDirectories={false}
        onChange={handleSelectionChange}
        info={helperText}
      />

      {files.length > 0 && (
        <Form.Description
          title="Selected Files"
          text={files
            .map((file) => `• ${file.name} (${formatBytes(file.size)})`)
            .join("\n")}
        />
      )}
    </Form>
  );
}