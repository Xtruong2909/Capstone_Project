import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Workflow,
  FolderOpen,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Info,
} from "lucide-react";
import { engineerService } from "../../../services/engineerService";
import {
  useEngineerJob,
  useEngineerMutation,
} from "../../../hooks/useEngineerData";
import { useLanguage } from "../../../hooks/useLanguage";
import {
  EngineerBadge,
  EngineerFeedback,
  EngineerHeader,
  EngineerJob,
} from "../components/EngineerUi";
import { formatBytes, MAX_UPLOAD_SIZE_BYTES } from "../utils/engineerHelpers";
import "../EngineerData.css";

const FILENAME_REGEX = /^\d{8}_d\d+_\d{4}_\d{4}\.csv$/i;

export default function EngineerUploadPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [metadata, setMetadata] = useState({
    group_name: "",
    source: "pNEUMA UAV Swarm",
    location_name: "Athens Central Business District, Greece",
    description: "",
  });
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const mutation = useEngineerMutation();
  const job = useEngineerJob("upload", true);
  const busy = mutation.busy || job.running;
  const finalResult = result || job.data?.result;

  // Analyze selected files and detect any format/size errors
  const analyzedFiles = useMemo(() => {
    return files.map((file) => {
      const isFormatValid = FILENAME_REGEX.test(file.name);
      const isSizeValid = file.size > 0 && file.size <= MAX_UPLOAD_SIZE_BYTES;
      let error = null;
      if (!isFormatValid) {
        error = t("File name must match YYYYMMDD_dX_HHMM_HHMM.csv");
      } else if (file.size === 0) {
        error = t("File is empty (0 bytes)");
      } else if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        error = t("File exceeds maximum upload size (2.5 GB)");
      }
      return {
        file,
        name: file.name,
        size: file.size,
        isValid: !error,
        error,
      };
    });
  }, [files, t]);

  const invalidFilesCount = useMemo(() => {
    return analyzedFiles.filter((item) => !item.isValid).length;
  }, [analyzedFiles]);

  const totalValidBytes = useMemo(() => {
    return analyzedFiles
      .filter((item) => item.isValid)
      .reduce((sum, item) => sum + item.size, 0);
  }, [analyzedFiles]);

  const handleSelectFiles = (selectedFileList) => {
    setValidationError("");
    mutation.clear();
    const incoming = Array.from(selectedFileList || []);
    if (!incoming.length) return;

    // Merge incoming with existing without duplicates by filename
    const existingNames = new Set(files.map((f) => f.name));
    const fresh = incoming.filter((f) => !existingNames.has(f.name));
    setFiles((prev) => [...prev, ...fresh]);
    setResult(null);
    job.track(null);
  };

  const handleRemoveFile = (indexToRemove) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setValidationError("");
  };

  const handleRemoveAllInvalid = () => {
    setFiles((prev) =>
      prev.filter(
        (f) =>
          FILENAME_REGEX.test(f.name) &&
          f.size > 0 &&
          f.size <= MAX_UPLOAD_SIZE_BYTES,
      ),
    );
    setValidationError("");
  };

  const handleClearAllFiles = () => {
    setFiles([]);
    setValidationError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    if (!files.length) {
      setValidationError(
        t("Select at least one CSV recording session to upload."),
      );
      return;
    }
    if (invalidFilesCount > 0) {
      setValidationError(
        t("Please remove or fix all invalid files before uploading."),
      );
      return;
    }

    setResult(null);
    setProgress(0);
    job.track(null);

    await mutation.run(async () => {
      const response = await engineerService.upload(
        { files, ...metadata },
        (progressEvent) => {
          if (progressEvent.total) {
            setProgress(
              Math.round((progressEvent.loaded * 100) / progressEvent.total),
            );
          }
        },
      );

      if (response?.job_id) {
        job.track(response);
      } else {
        setResult(response);
      }
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    });
  };

  return (
    <div className="de-workspace">
      {/* Upload & Staging Card */}
      <section className="admin-card">
        <EngineerHeader
          title="Upload Dataset"
          onRefresh={() => {
            setFiles([]);
            setResult(null);
            job.track(null);
          }}
        />

        <form className="de-form" onSubmit={handleUploadSubmit}>
          {/* Drag & Drop Zone */}
          <label
            className={`de-dropzone ${isDragOver ? "is-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (!busy && e.dataTransfer.files) {
                handleSelectFiles(e.dataTransfer.files);
              }
            }}
          >
            <div className="empty-state__icon-box">
              <Upload size={28} />
            </div>
            <strong style={{ fontSize: "15px", color: "#0f172a" }}>
              {t("Select or drop multiple CSV recording files")}
            </strong>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {t(
                "Each file represents an individual UAV recording flight (e.g. 20181024_d1_0830_0900.csv)",
              )}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              disabled={busy}
              style={{ display: "none" }}
              aria-label={t("Select CSV files")}
              onChange={(e) => handleSelectFiles(e.target.files)}
            />
          </label>

          {/* Staged Files List & Validation Inspector */}
          {analyzedFiles.length > 0 && (
            <div
              className="admin-card"
              style={{ border: "1px solid #e2e8f0", background: "#fafbfc" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                  padding: "12px 16px",
                  borderBottom: "1px solid #e2e8f0",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <FileSpreadsheet size={18} style={{ color: "#2563eb" }} />
                  <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                    {t("Staged Sessions")} ({analyzedFiles.length})
                  </strong>
                  <span className="adm-badge adm-badge--blue">
                    {formatBytes(totalValidBytes)}
                  </span>
                  {invalidFilesCount > 0 && (
                    <span className="badge badge--rejected">
                      {invalidFilesCount} {t("Invalid")}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {invalidFilesCount > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleRemoveAllInvalid}
                      style={{ height: "32px", fontSize: "12px" }}
                    >
                      {t("Remove Invalid Files")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleClearAllFiles}
                    style={{ height: "32px", fontSize: "12px" }}
                  >
                    {t("Clear All")}
                  </button>
                </div>
              </div>

              <div className="de-selected-files" style={{ maxHeight: "240px" }}>
                {analyzedFiles.map((item, idx) => (
                  <div
                    key={item.name + idx}
                    className={`de-selected-file-row ${!item.isValid ? "is-invalid" : ""}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      background: item.isValid ? "#ffffff" : "#fef2f2",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        minWidth: 0,
                      }}
                    >
                      {item.isValid ? (
                        <CheckCircle2
                          size={16}
                          style={{ color: "#16a34a", flexShrink: 0 }}
                        />
                      ) : (
                        <AlertTriangle
                          size={16}
                          style={{ color: "#dc2626", flexShrink: 0 }}
                        />
                      )}
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: "13px",
                          color: item.isValid ? "#1e293b" : "#991b1b",
                          fontFamily: "monospace",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </span>
                      {!item.isValid && (
                        <small
                          style={{
                            color: "#dc2626",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          ({item.error})
                        </small>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        flexShrink: 0,
                      }}
                    >
                      <small style={{ color: "#64748b", fontSize: "12px" }}>
                        {formatBytes(item.size)}
                      </small>
                      <button
                        type="button"
                        className="de-file-remove-btn"
                        onClick={() => handleRemoveFile(idx)}
                        disabled={busy}
                        aria-label={`${t("Remove")} ${item.name}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata Form Grid */}
          <div className="de-form-grid">
            <label className="form-field">
              <span>{t("Batch Name")}</span>
              <input
                className="admin-input"
                type="text"
                placeholder={t(
                  "Optional batch label (e.g. Athens Corridor 1318 Drone 1)",
                )}
                maxLength={128}
                value={metadata.group_name}
                disabled={busy}
                onChange={(e) =>
                  setMetadata({ ...metadata, group_name: e.target.value })
                }
              />
            </label>

            <label className="form-field">
              <span>{t("Source")}</span>
              <input
                className="admin-input"
                type="text"
                maxLength={255}
                value={metadata.source}
                disabled={busy}
                onChange={(e) =>
                  setMetadata({ ...metadata, source: e.target.value })
                }
              />
            </label>

            <label className="form-field">
              <span>{t("Location")}</span>
              <input
                className="admin-input"
                type="text"
                maxLength={255}
                value={metadata.location_name}
                disabled={busy}
                onChange={(e) =>
                  setMetadata({ ...metadata, location_name: e.target.value })
                }
              />
            </label>

            <label className="form-field">
              <span>{t("Description")}</span>
              <input
                className="admin-input"
                type="text"
                placeholder={t(
                  "Optional notes about capture weather or road section...",
                )}
                maxLength={2000}
                value={metadata.description}
                disabled={busy}
                onChange={(e) =>
                  setMetadata({ ...metadata, description: e.target.value })
                }
              />
            </label>
          </div>

          {/* Validation Notice */}
          {validationError && (
            <p className="admin-notice admin-notice--error" role="alert">
              {validationError}
            </p>
          )}

          <EngineerFeedback mutation={mutation} />

          {/* Upload Progress Bar */}
          {mutation.busy && (
            <div style={{ padding: "8px 0" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#2563eb",
                  marginBottom: "6px",
                }}
              >
                <span>{t("Uploading sessions to staging storage...")}</span>
                <span>{progress}%</span>
              </div>
              <progress
                value={progress}
                max="100"
                style={{ width: "100%", height: "8px" }}
              />
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="submit"
              className="btn-action btn-action--primary"
              disabled={busy || !files.length || invalidFilesCount > 0}
            >
              <Upload size={16} />
              <span>
                {t("Upload Sessions")} ({files.length})
              </span>
            </button>
            <span style={{ fontSize: "13px", color: "#64748b" }}>
              <Info
                size={14}
                style={{
                  display: "inline",
                  marginRight: "4px",
                  verticalAlign: "-2px",
                }}
              />
              {t(
                "Sessions will be automatically grouped into datasets by recording date and drone ID.",
              )}
            </span>
          </div>
        </form>
      </section>

      {/* Background Job Tracker */}
      <EngineerJob resource={job} />

      {/* Upload Results Summary Card */}
      {finalResult && (
        <section className="admin-card">
          <EngineerHeader title="Upload Results" />
          <div className="de-summary">
            <span>
              {t("Uploaded")}:{" "}
              <strong>{finalResult.uploaded_count || 0}</strong>
            </span>
            <span>
              {t("Duplicates")}:{" "}
              <strong>{finalResult.duplicate_count || 0}</strong>
            </span>
            <span>
              {t("Failed")}: <strong>{finalResult.failed_count || 0}</strong>
            </span>
          </div>

          {finalResult.files?.length > 0 && (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("File")}</th>
                    <th>{t("Dataset")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {finalResult.files.map((f, idx) => (
                    <tr key={f.original_filename + idx}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                        {f.original_filename}
                      </td>
                      <td>{f.dataset_name || "—"}</td>
                      <td>
                        <EngineerBadge value={f.status} />
                      </td>
                      <td className="admin-wrap-cell">
                        {f.error_message || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              background: "#f8fafc",
            }}
          >
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setResult(null);
                job.track(null);
              }}
            >
              <RefreshCw size={15} />
              <span>{t("Upload More Files")}</span>
            </button>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  navigate(
                    "/engineer/datasets" +
                      (finalResult.group_id
                        ? "?groupId=" + encodeURIComponent(finalResult.group_id)
                        : ""),
                  )
                }
              >
                <FolderOpen size={16} />
                <span>{t("View in Dataset Catalog")}</span>
              </button>
              <button
                type="button"
                className="btn-action btn-action--primary"
                onClick={() =>
                  navigate(
                    "/engineer/pipeline-studio" +
                      (finalResult.group_id
                        ? "?groupId=" + encodeURIComponent(finalResult.group_id)
                        : ""),
                  )
                }
              >
                <Workflow size={16} />
                <span>{t("Proceed to Pipeline Studio")}</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
