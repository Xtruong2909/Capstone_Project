import { useEffect, useState, useCallback, useMemo } from "react";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  Workflow,
  RefreshCw,
  AlertCircle,
  Upload,
  Database,
  FileSpreadsheet,
} from "lucide-react";
import PipelineStepper from "../components/PipelineStepper";
import Step1ColumnMapping from "../components/pipeline/Step1ColumnMapping";
import Step2QualityInspection from "../components/pipeline/Step2QualityInspection";
import Step3NormalizationSubmit from "../components/pipeline/Step3NormalizationSubmit";
import { DatasetStatusBadge } from "../components/DatasetDetailModal";
import { datasetService } from "../../../services/datasetService";
import pipelineService from "../../../services/pipelineService";
import {
  formatBytes,
  resolveEffectiveVersionTag,
} from "../utils/engineerHelpers";

/**
 * Default empty state blueprint for a dataset's wizard session.
 */
function createDefaultDatasetWizardState() {
  return {
    columns: [],
    savedMappings: [],
    columnsLoaded: false,
    quality: {
      checkId: null,
      status: "idle",
      progressPercent: 0,
      processedRows: 0,
      totalRows: 0,
      report: null,
      errorMessage: null,
      issues: [],
      issuesTotal: 0,
    },
    normalization: {
      normalizeResult: null,
      validationResult: null,
      previewData: null,
      versionTag: "v1.1",
      exportFormat: "PARQUET",
      submitNote:
        "Standardized to pNEUMA Parquet schema and verified data quality.",
      submissionSuccess: null,
    },
    completedSteps: [],
  };
}

/**
 * EngineerPipelineStudioPage
 *
 * Top-level orchestrator page for the 3-step sequential Data Pipeline Studio:
 * 1. Column Mapping Studio (Inspection, Aliases & pNEUMA 10 Core UAV Fields)
 * 2. Data Quality Inspection (Kinematic Scans, Anomalies & Paginated Issues)
 * 3. Normalization & Preview (Parquet Staging, Before/After & Admin Review Submission)
 *
 * Features:
 * - URL query parameter synchronization: ?datasetId=...&step=1|2|3
 * - Centralized wizard state container across step and dataset switching
 * - Dataset selector in header with metadata badges
 * - Reusable PipelineStepper with Active, Completed, and Upcoming visual states
 */
export default function EngineerPipelineStudioPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    datasets = [],
    isLoadingCatalog = false,
    catalogError = null,
    versionLineageMap = {},
    fetchCatalogAndHealth,
  } = useOutletContext();

  // ---- URL Params Extraction ----
  const queryDatasetId = searchParams.get("datasetId") || "";
  const queryStep = parseInt(searchParams.get("step") || "1", 10);
  const activeStep = [1, 2, 3].includes(queryStep) ? queryStep : 1;

  // ---- Centralized Multi-Dataset Wizard State ----
  const [wizardStateByDataset, setWizardStateByDataset] = useState({});
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [columnsFetchError, setColumnsError] = useState(null);

  // Distinct datasets deduplicated by dataset_id so each dropdown option is unique and selectable
  const uniqueDatasets = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const d of datasets) {
      if (d?.dataset_id && !seen.has(d.dataset_id)) {
        seen.add(d.dataset_id);
        result.push(d);
      }
    }
    return result;
  }, [datasets]);

  // Determine active dataset object from catalog
  const activeDataset = useMemo(() => {
    if (queryDatasetId) {
      const match = uniqueDatasets.find((d) => d.dataset_id === queryDatasetId);
      if (match) return match;
    }
    return uniqueDatasets[0] || null;
  }, [queryDatasetId, uniqueDatasets]);

  const activeDatasetId = activeDataset?.dataset_id || "";

  // Sync initial URL params if missing datasetId
  useEffect(() => {
    if (!queryDatasetId && activeDatasetId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("datasetId", activeDatasetId);
          if (!next.has("step")) next.set("step", "1");
          return next;
        },
        { replace: true },
      );
    }
  }, [queryDatasetId, activeDatasetId, setSearchParams]);

  // Get or initialize active dataset state
  const currentWizardState = useMemo(() => {
    if (!activeDatasetId) return createDefaultDatasetWizardState();
    return (
      wizardStateByDataset[activeDatasetId] || createDefaultDatasetWizardState()
    );
  }, [activeDatasetId, wizardStateByDataset]);

  // ---- Step Transition Handler ----
  const goToStep = useCallback(
    (stepNumber) => {
      const clamped = Math.max(1, Math.min(3, stepNumber));
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (activeDatasetId) next.set("datasetId", activeDatasetId);
          next.set("step", String(clamped));
          return next;
        },
        { replace: false },
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [activeDatasetId, setSearchParams],
  );

  // ---- Dataset Switcher Handler ----
  const handleDatasetChange = useCallback(
    (newDatasetId) => {
      if (!newDatasetId || newDatasetId === activeDatasetId) return;
      setSearchParams({
        datasetId: newDatasetId,
        step: "1",
      });
    },
    [activeDatasetId, setSearchParams],
  );

  // Trigger column loading when dataset changes if not yet loaded
  useEffect(() => {
    if (!activeDatasetId) return;
    const stateForDataset = wizardStateByDataset[activeDatasetId];
    if (stateForDataset?.columnsLoaded) return;

    let isCancelled = false;
    const load = async () => {
      await Promise.resolve();
      if (isCancelled) return;
      setIsLoadingColumns(true);
      setColumnsError(null);

      try {
        const [colsRes, mappingsRes] = await Promise.all([
          pipelineService.getDatasetColumns(activeDatasetId).catch(() => null),
          pipelineService.getColumnMappings(activeDatasetId).catch(() => null),
        ]);
        if (isCancelled) return;

        let cols = colsRes?.columns || [];
        const mappings = mappingsRes?.mappings || [];

        if (!cols || cols.length === 0) {
          const previewRes = await datasetService
            .getDatasetPreview(activeDatasetId, 1, 5, "raw")
            .catch(() => null);
          if (previewRes?.columns && Array.isArray(previewRes.columns)) {
            cols = previewRes.columns.map((c, idx) => ({
              index: idx,
              source_column: typeof c === "string" ? c : c.name || `col_${idx}`,
              data_type: "STRING",
              mapped_column: null,
              is_mapped: false,
            }));
          }
        }
        if (isCancelled) return;

        setWizardStateByDataset((prev) => {
          const existing =
            prev[activeDatasetId] || createDefaultDatasetWizardState();
          const hasMappings = Array.isArray(mappings) && mappings.length > 0;
          const updatedCompleted = new Set(existing.completedSteps || []);
          if (hasMappings) updatedCompleted.add(1);

          return {
            ...prev,
            [activeDatasetId]: {
              ...existing,
              columns: cols,
              savedMappings: mappings,
              columnsLoaded: true,
              completedSteps: Array.from(updatedCompleted),
            },
          };
        });
      } catch (err) {
        if (!isCancelled) {
          setColumnsError(
            err.response?.data?.detail ||
              err.message ||
              "Failed to load dataset columns.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingColumns(false);
        }
      }
    };

    load();
    return () => {
      isCancelled = true;
    };
  }, [activeDatasetId]);

  // ---- Wizard State Update Callbacks ----

  // Step 1: Mappings saved callback
  const handleMappingsSaved = useCallback(
    (payload) => {
      if (!activeDatasetId) return;
      const mappingsList = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.mappings)
          ? payload.mappings
          : Object.entries(payload || {}).map(([src, tgt]) => ({
              source_column: src,
              target_column: tgt,
            }));

      setWizardStateByDataset((prev) => {
        const existing =
          prev[activeDatasetId] || createDefaultDatasetWizardState();
        const updatedCompleted = new Set(existing.completedSteps || []);
        updatedCompleted.add(1);

        return {
          ...prev,
          [activeDatasetId]: {
            ...existing,
            savedMappings: mappingsList,
            completedSteps: Array.from(updatedCompleted),
          },
        };
      });
    },
    [activeDatasetId],
  );

  // Step 2: Quality Inspection state update callback
  const handleQualityStateChange = useCallback(
    (newQualityState) => {
      if (!activeDatasetId) return;
      setWizardStateByDataset((prev) => {
        const existing =
          prev[activeDatasetId] || createDefaultDatasetWizardState();
        const mergedQuality = { ...existing.quality, ...newQualityState };
        const updatedCompleted = new Set(existing.completedSteps || []);

        if (mergedQuality.status === "completed") {
          updatedCompleted.add(2);
        }

        return {
          ...prev,
          [activeDatasetId]: {
            ...existing,
            quality: mergedQuality,
            completedSteps: Array.from(updatedCompleted),
          },
        };
      });
    },
    [activeDatasetId],
  );

  // Step 3: Normalization & Review state update callback
  const handleNormalizationStateChange = useCallback(
    (newNormState) => {
      if (!activeDatasetId) return;
      setWizardStateByDataset((prev) => {
        const existing =
          prev[activeDatasetId] || createDefaultDatasetWizardState();
        const mergedNorm = { ...existing.normalization, ...newNormState };
        const updatedCompleted = new Set(existing.completedSteps || []);

        if (mergedNorm.normalizeResult || mergedNorm.submissionSuccess) {
          updatedCompleted.add(3);
        }

        return {
          ...prev,
          [activeDatasetId]: {
            ...existing,
            normalization: mergedNorm,
            completedSteps: Array.from(updatedCompleted),
          },
        };
      });
    },
    [activeDatasetId],
  );

  // Handle workflow completion: navigate to catalog
  const handleWorkflowComplete = useCallback(() => {
    fetchCatalogAndHealth?.();
    navigate("/engineer/datasets");
  }, [fetchCatalogAndHealth, navigate]);

  // ---- Render Helpers ----
  const effectiveVersion = activeDataset
    ? resolveEffectiveVersionTag(activeDataset, versionLineageMap)
    : "v1.0";

  return (
    <div className="engineer-pipeline-studio" style={{ paddingBottom: "3rem" }}>
      {/* =========================================================================
          TOP HEADER & DATASET SELECTOR CARD
         ========================================================================= */}
      <div className="admin-card" style={{ marginBottom: "1.25rem" }}>
        <div
          className="admin-card__header"
          style={{ alignItems: "flex-start" }}
        >
          <div className="admin-card__header-left">
            <div
              className="admin-card__icon-box"
              style={{
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                color: "#2563eb",
                border: "1px solid #bfdbfe",
              }}
            >
              <Workflow size={22} />
            </div>
            <div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
              >
                <h3
                  className="admin-card__title"
                  style={{ fontSize: "1.2rem", margin: 0 }}
                >
                  Data Pipeline Studio
                </h3>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.55rem",
                    borderRadius: "999px",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    border: "1px solid #bfdbfe",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  pNEUMA UAV Pipeline
                </span>
              </div>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.82rem",
                  color: "#64748b",
                  lineHeight: 1.4,
                }}
              ></p>
            </div>
          </div>

          {/* Quick Header Navigation Actions */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                fetchCatalogAndHealth?.();
                if (activeDatasetId) {
                  setWizardStateByDataset((prev) => ({
                    ...prev,
                    [activeDatasetId]: {
                      ...(prev[activeDatasetId] ||
                        createDefaultDatasetWizardState()),
                      columnsLoaded: false,
                    },
                  }));
                }
              }}
              title="Refresh dataset metadata & columns"
              style={{ padding: "0.42rem 0.75rem", fontSize: "0.8rem" }}
            >
              <RefreshCw
                size={14}
                className={
                  isLoadingCatalog || isLoadingColumns ? "animate-spin" : ""
                }
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              className="btn-action"
              onClick={() => navigate("/engineer/datasets")}
              style={{
                background: "#f8fafc",
                color: "#334155",
                border: "1px solid #cbd5e1",
                padding: "0.42rem 0.75rem",
                fontSize: "0.8rem",
              }}
            >
              <FileSpreadsheet size={14} />
              <span>Catalog</span>
            </button>
          </div>
        </div>

        {/* Dataset Selector Control Bar */}
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.85rem 1rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
              flex: "1 1 340px",
              minWidth: "280px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.84rem",
                fontWeight: 700,
                color: "#1e293b",
                whiteSpace: "nowrap",
              }}
            >
              <Database size={16} color="#2563eb" />
              <span>Target Dataset:</span>
            </div>

            <select
              className="admin-select"
              value={activeDatasetId}
              onChange={(e) => handleDatasetChange(e.target.value)}
              disabled={isLoadingCatalog || uniqueDatasets.length === 0}
              style={{
                flex: 1,
                fontSize: "0.84rem",
                fontWeight: 600,
                padding: "0.45rem 0.8rem",
                background: "#ffffff",
                borderColor: "#cbd5e1",
              }}
            >
              {uniqueDatasets.length === 0 ? (
                <option value="">No datasets available</option>
              ) : (
                uniqueDatasets.map((d) => (
                  <option key={d.dataset_id} value={d.dataset_id}>
                    {d.name} ({d.file_format || "CSV"}) — [{d.approval_status}] ({resolveEffectiveVersionTag(d, versionLineageMap)})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Active Dataset Metadata Badges */}
          {activeDataset && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                flexWrap: "wrap",
                fontSize: "0.78rem",
              }}
            >
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "0.22rem 0.55rem",
                  borderRadius: "6px",
                  fontWeight: 600,
                  border: "1px solid #e2e8f0",
                }}
              >
                Code: <code>{activeDataset.code}</code>
              </span>

              <span
                style={{
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  padding: "0.22rem 0.55rem",
                  borderRadius: "6px",
                  fontWeight: 700,
                  border: "1px solid #bfdbfe",
                }}
              >
                Version: {effectiveVersion}
              </span>

              <span
                style={{
                  background: "#f8fafc",
                  color: "#334155",
                  padding: "0.22rem 0.55rem",
                  borderRadius: "6px",
                  fontWeight: 600,
                  border: "1px solid #e2e8f0",
                }}
              >
                {activeDataset.file_format} (
                {formatBytes(activeDataset.file_size_bytes)})
              </span>

              <DatasetStatusBadge status={activeDataset.approval_status} />
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          ERROR / EMPTY STATES
         ========================================================================= */}
      {catalogError && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            padding: "0.9rem 1.15rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            color: "#b91c1c",
            marginBottom: "1.25rem",
            fontSize: "0.86rem",
            fontWeight: 600,
          }}
        >
          <AlertCircle size={18} />
          <span>{catalogError}</span>
        </div>
      )}

      {columnsFetchError && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            padding: "0.9rem 1.15rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "12px",
            color: "#92400e",
            marginBottom: "1.25rem",
            fontSize: "0.86rem",
            fontWeight: 600,
          }}
        >
          <AlertCircle size={18} />
          <span>{columnsFetchError}</span>
        </div>
      )}

      {/* Empty State when no datasets in database */}
      {!isLoadingCatalog && datasets.length === 0 ? (
        <div
          className="admin-card"
          style={{ textAlign: "center", padding: "3.5rem 1.5rem" }}
        >
          <div
            className="vivid-empty-box__icon"
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
              color: "#1d4ed8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.15)",
            }}
          >
            <Upload size={28} />
          </div>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 800,
              color: "#0f172a",
              margin: "0 0 0.4rem",
            }}
          >
            No Datasets Available in Catalog
          </h3>
          <p
            style={{
              fontSize: "0.88rem",
              color: "#64748b",
              maxWidth: "460px",
              margin: "0 auto 1.5rem",
            }}
          >
            To run the Data Pipeline Studio, first upload a raw traffic dataset
            (.csv, .parquet, .xlsx) in the Upload & Versioning workspace.
          </p>
          <button
            type="button"
            className="btn-action btn-action--primary"
            onClick={() => navigate("/engineer/upload")}
            style={{ padding: "0.65rem 1.35rem", fontSize: "0.88rem" }}
          >
            <Upload size={16} />
            <span>Upload Traffic Dataset</span>
          </button>
        </div>
      ) : (
        <>
          {/* =========================================================================
              SEQUENTIAL REUSABLE STEPPER
             ========================================================================= */}
          <PipelineStepper
            activeStep={activeStep}
            completedSteps={currentWizardState.completedSteps}
            onStepClick={goToStep}
          />

          {/* =========================================================================
              STEP 1: COLUMN MAPPING STUDIO
             ========================================================================= */}
          {activeStep === 1 && (
            <div className="pipeline-step-container">
              <Step1ColumnMapping
                datasetId={activeDatasetId}
                columns={currentWizardState.columns}
                savedMappings={currentWizardState.savedMappings}
                onMappingsSaved={handleMappingsSaved}
                onNext={() => goToStep(2)}
                isLoading={isLoadingColumns}
              />
            </div>
          )}

          {/* =========================================================================
              STEP 2: DATA QUALITY INSPECTION
             ========================================================================= */}
          {activeStep === 2 && (
            <div className="pipeline-step-container">
              <Step2QualityInspection
                datasetId={activeDatasetId}
                qualityState={currentWizardState.quality}
                onStateChange={handleQualityStateChange}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
              />
            </div>
          )}

          {/* =========================================================================
              STEP 3: NORMALIZATION & FINAL PREVIEW / SUBMIT
             ========================================================================= */}
          {activeStep === 3 && (
            <div className="pipeline-step-container">
              <Step3NormalizationSubmit
                datasetId={activeDatasetId}
                dataset={activeDataset}
                qualityCheckId={currentWizardState.quality?.checkId}
                normalizationState={currentWizardState.normalization}
                onStateChange={handleNormalizationStateChange}
                onUpdateState={handleNormalizationStateChange}
                onBack={() => goToStep(2)}
                onComplete={handleWorkflowComplete}
                onNavigate={navigate}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
