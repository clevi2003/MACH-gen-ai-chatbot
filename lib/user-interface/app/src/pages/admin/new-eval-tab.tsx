import {
  Button,
  Container,
  FileUpload,
  Flashbar,
  FlashbarProps,
  Form,
  FormField,
  Input,
  ProgressBar,
  ProgressBarProps,
  Select,
  SelectProps,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useContext, useState } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Utils } from "../../common/utils";
import { FileUploader } from "../../common/file-uploader";
import { useNavigate } from "react-router-dom";

const fileExtensions = new Set([".csv", ".xlsx"]);

const mimeTypes = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".tar": "application/x-tar",
};

export interface FileUploadTabProps {
  tabChangeFunction: () => void;
}

export default function NewEvalTab(props: FileUploadTabProps) {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [globalError, setGlobalError] = useState<string | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);
  const [uploadingStatus, setUploadingStatus] =
    useState<FlashbarProps.Type>("info");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadingIndex, setUploadingIndex] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [uploadPanelDismissed, setUploadPanelDismissed] =
    useState<boolean>(false);

  const [evalName, setEvalName] = useState<string>("SampleEvalName");

  const onSetFiles = (files: File[]) => {
    const errors: string[] = [];
    const filesToUpload: File[] = [];
    setUploadError(undefined);

    if (files.length > 100) {
      setUploadError("Max 100 files allowed");
      files = files.slice(0, 100);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExtension = file.name.split(".").pop()?.toLowerCase();

      if (!fileExtensions.has(`.${fileExtension}`)) {
        errors[i] = "Format not supported";
      } else if (file.size > 1000 * 1000 * 100) {
        errors[i] = "File size is too large, max 100MB";
      } else {
        filesToUpload.push(file);
      }
    }

    setFiles(files);
    setFileErrors(errors);
    setFilesToUpload(filesToUpload);
  };

  const onUpload = async () => {
    if (!appContext) return;
    setUploadingStatus("in-progress");
    setUploadProgress(0);
    setUploadingIndex(1);
    setUploadPanelDismissed(false);

    const uploader = new FileUploader();
    const totalSize = filesToUpload.reduce((acc, file) => acc + file.size, 0);
    let accumulator = 0;
    let hasError = false;

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setCurrentFileName(file.name);
      let fileUploaded = 0;

      try {
        const fileExtension = file.name
          .slice(file.name.lastIndexOf("."))
          .toLowerCase();
        const fileType = mimeTypes[fileExtension];
        const result = await apiClient.knowledgeManagement.getUploadURL(
          file.name,
          fileType
        );

        try {
          await uploader.upload(
            file,
            result,
            fileType,
            (uploaded: number) => {
              fileUploaded = uploaded;
              const totalUploaded = fileUploaded + accumulator;
              const percent = Math.round((totalUploaded / totalSize) * 100);
              setUploadProgress(percent);
            }
          );

          accumulator += file.size;
          setUploadingIndex(Math.min(filesToUpload.length, i + 2));
        } catch (error) {
          console.error(error);
          setUploadingStatus("error");
          hasError = true;
          break;
        }
      } catch (error: any) {
        setGlobalError(Utils.getErrorMessage(error));
        console.error(Utils.getErrorMessage(error));
        setUploadingStatus("error");
        hasError = true;
        break;
      }
    }

    if (!hasError) {
      setUploadingStatus("success");
      setFilesToUpload([]);
      setFiles([]);
    }
  };

  const getProgressbarStatus = (): ProgressBarProps.Status => {
    if (uploadingStatus === "error") return "error";
    if (uploadingStatus === "success") return "success";
    return "in-progress";
  };

  const onNewEvaluation = () => {
    navigate("/admin/evaluations/new");
  };

  return (
    <Form
      actions={
        <SpaceBetween direction="vertical" size="xs">
          <Button
            data-testid="create"
            variant="primary"
            disabled={
              filesToUpload.length === 0 || uploadingStatus === "in-progress"
            }
            onClick={onUpload}
          >
            Upload files
          </Button>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center"}}>
            <Button
              data-testid="new-evaluation"
              variant="primary"
              onClick={onNewEvaluation}
            >
              Create New Evaluation
            </Button>
          </div>
        </SpaceBetween>
      }
      errorText={globalError}
    >
      <SpaceBetween size="l">
        <Container>
          <SpaceBetween size="l">
            <FormField label="Evaluation Name">
              <Input
                value={evalName}
                placeholder="SampleEvalName"
                onChange={(event) => setEvalName(event.detail.value)}
              />
            </FormField>
            <FormField>
              <FileUpload
                onChange={({ detail }) => onSetFiles(detail.value)}
                value={files}
                i18nStrings={{
                  uploadButtonText: (e) => (e ? "Choose files" : "Choose file"),
                  dropzoneText: (e) =>
                    e ? "Drop files to upload" : "Drop file to upload",
                  removeFileAriaLabel: (e) => `Remove file ${e + 1}`,
                  limitShowFewer: "Show fewer files",
                  limitShowMore: "Show more files",
                  errorIconAriaLabel: "Error",
                }}
                multiple
                showFileLastModified
                showFileSize
                showFileThumbnail
                tokenLimit={3}
                constraintText={`Text documents up to 100MB supported (${Array.from(
                  fileExtensions.values()
                ).join(", ")})`}
                fileErrors={fileErrors}
                errorText={uploadError}
              />
            </FormField>
          </SpaceBetween>
        </Container>
        {uploadingStatus !== "info" && !uploadPanelDismissed && (
          <Flashbar
            items={[
              {
                content: (
                  <ProgressBar
                    value={uploadProgress}
                    variant="flash"
                    description={
                      uploadingStatus === "success" ||
                      uploadingStatus === "error"
                        ? null
                        : currentFileName
                    }
                    label={
                      uploadingStatus === "success" ||
                      uploadingStatus === "error"
                        ? "Uploading files"
                        : `Uploading files ${uploadingIndex} of ${filesToUpload.length}`
                    }
                    status={getProgressbarStatus()}
                    resultText={
                      uploadingStatus === "success"
                        ? "Upload complete"
                        : "Upload failed"
                    }
                  />
                ),
                type: uploadingStatus,
                dismissible:
                  uploadingStatus === "success" || uploadingStatus === "error",
                onDismiss: () => setUploadPanelDismissed(true),
                buttonText:
                  uploadingStatus === "success" ? "View files" : undefined,
                onButtonClick: () => props.tabChangeFunction(),
              },
            ]}
          />
        )}
      </SpaceBetween>
    </Form>
  );
}
