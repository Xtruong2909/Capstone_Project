import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Workflow, FolderOpen, FileSpreadsheet, AlertTriangle,
  CheckCircle2, X, RefreshCw, Info,
} from "lucide-react";
import { useEngineerUpload } from "../../../hooks/useEngineerUpload";
import { useLanguage } from "../../../hooks/useLanguage";
import {
  EngineerBadge, EngineerFeedback, EngineerHeader, EngineerJob,
} from "../components/EngineerUi";
import { formatBytes } from "../utils/engineerHelpers";
import "../EngineerData.css";

const DEFAULT_SOURCE = "pNEUMA UAV Swarm";
const DEFAULT_LOCATION = "Athens Central Business District, Greece";

export default function EngineerUploadPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const {
    files, metadata, setMetadata, progress, uploadPhase, finalResult, validationError,
    mutation, job, busy, analyzedFiles, invalidFilesCount, totalValidBytes,
    handleSelectFiles, handleRemoveFile, handleRemoveAllInvalid, handleClearAllFiles,
    handleUploadSubmit, reset,
  } = useEngineerUpload();

  useEffect(() => {
    if (!files.length && fileInputRef.current) fileInputRef.current.value = "";
  }, [files]);

  return (
    <div className="de-workspace">
      {/* Upload & Staging Card */}
      <section className="admin-card">
        <EngineerHeader
          title="Upload Dataset"
          onRefresh={reset}
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
                      disabled={busy}
                      style={{ height: "32px", fontSize: "12px" }}
                    >
                      {t("Remove Invalid Files")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleClearAllFiles}
                    disabled={busy}
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
                placeholder={t(DEFAULT_SOURCE)}
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
                placeholder={t(DEFAULT_LOCATION)}
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

          <EngineerFeedback mutation={{ ...mutation, success: !busy && finalResult && finalResult.failed_count === 0
            ? t('Upload and dataset registration completed.') : '' }} />

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
                <span>{t(uploadPhase === 's3' ? 'Uploading recordings directly to S3...'
                  : uploadPhase === 'confirming' ? 'Confirming files on S3...'
                    : uploadPhase === 'preparing' ? 'Preparing upload...'
                      : 'Uploading sessions to staging storage...')}</span>
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
              onClick={reset}
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
