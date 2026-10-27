import { useState, useMemo } from "react";
import {
  Sparkles,
  Save,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Table,
  RefreshCw,
  X,
  Info,
  Layers,
  Check,
  Eye,
} from "lucide-react";
import pipelineService, {
  PNEUMA_STANDARD_FIELDS,
} from "../../../../services/pipelineService";

/**
 * Standard pNEUMA UAV Trajectory Fields fallback in case of import variance.
 */
const DEFAULT_STANDARD_FIELDS = PNEUMA_STANDARD_FIELDS || [
  {
    name: "track_id",
    type: "integer",
    required: true,
    description: "Trajectory ID",
  },
  {
    name: "type",
    type: "string",
    required: false,
    description: "Vehicle Class",
  },
  {
    name: "traveled_d",
    type: "float",
    required: false,
    description: "Traveled Distance (m)",
  },
  {
    name: "avg_speed",
    type: "float",
    required: false,
    description: "Average Speed (km/h)",
  },
  {
    name: "lat",
    type: "float",
    required: true,
    description: "Latitude (WGS84)",
  },
  {
    name: "lon",
    type: "float",
    required: true,
    description: "Longitude (WGS84)",
  },
  {
    name: "speed",
    type: "float",
    required: true,
    description: "Instant Speed (km/h)",
  },
  {
    name: "lon_acc",
    type: "float",
    required: false,
    description: "Longitudinal Acceleration (m/s²)",
  },
  {
    name: "lat_acc",
    type: "float",
    required: false,
    description: "Lateral Acceleration (m/s²)",
  },
  {
    name: "time",
    type: "float",
    required: true,
    description: "Elapsed Time (s)",
  },
];

/**
 * Normalizes raw column descriptor from various potential schemas into a standard object.
 */
function normalizeSourceColumn(col, index) {
  if (typeof col === "string") {
    return {
      index,
      source_column: col.trim(),
      data_type: "STRING",
      mapped_column: null,
      is_mapped: false,
    };
  }
  if (col && typeof col === "object") {
    const source = (
      col.source_column ||
      col.name ||
      col.column_name ||
      `col_${index}`
    ).trim();
    const target = col.mapped_column || col.target_column || null;
    return {
      index,
      source_column: source,
      data_type: (col.data_type || col.type || "UNKNOWN").toUpperCase(),
      mapped_column: target,
      is_mapped: Boolean(col.is_mapped || target),
    };
  }
  return {
    index,
    source_column: `col_${index}`,
    data_type: "UNKNOWN",
    mapped_column: null,
    is_mapped: false,
  };
}

/**
 * Extracts a flat key-value dictionary { [source_column]: target_column } from saved mappings.
 */
function extractMappingsMap(savedMappings) {
  const map = {};
  if (!savedMappings) return map;

  if (Array.isArray(savedMappings)) {
    savedMappings.forEach((item) => {
      if (item && item.source_column) {
        map[item.source_column] = item.target_column || "";
      }
    });
  } else if (Array.isArray(savedMappings.mappings)) {
    savedMappings.mappings.forEach((item) => {
      if (item && item.source_column) {
        map[item.source_column] = item.target_column || "";
      }
    });
  } else if (typeof savedMappings === "object") {
    Object.entries(savedMappings).forEach(([src, tgt]) => {
      map[src] = tgt || "";
    });
  }
  return map;
}

/**
 * Inferred Data Type Pill Badge.
 */
function DataTypeBadge({ type }) {
  const t = String(type || "UNKNOWN").toUpperCase();
  let bg = "#f1f5f9";
  let color = "#475569";
  let border = "#e2e8f0";

  if (t.includes("INT")) {
    bg = "#eff6ff";
    color = "#1d4ed8";
    border = "#bfdbfe";
  } else if (
    t.includes("FLOAT") ||
    t.includes("DOUBLE") ||
    t.includes("NUM") ||
    t.includes("DEC") ||
    t.includes("REAL")
  ) {
    bg = "#f5f3ff";
    color = "#6d28d9";
    border = "#ddd6fe";
  } else if (t.includes("STR") || t.includes("CHAR") || t.includes("TEXT")) {
    bg = "#f8fafc";
    color = "#334155";
    border = "#cbd5e1";
  } else if (t.includes("TIME") || t.includes("DATE")) {
    bg = "#fffbeb";
    color = "#b45309";
    border = "#fde68a";
  } else if (t.includes("BOOL")) {
    bg = "#ecfdf5";
    color = "#047857";
    border = "#a7f3d0";
  }

  return (
    <span
      className="badge"
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontFamily: "monospace",
        fontSize: "0.72rem",
        padding: "0.15rem 0.45rem",
      }}
    >
      {t}
    </span>
  );
}

/**
 * Confidence Score Pill Badge.
 */
function ConfidenceBadge({ confInfo }) {
  if (!confInfo || typeof confInfo.confidence !== "number") return null;
  const pct = Math.round(confInfo.confidence * 100);
  let bg = "#ecfdf5";
  let color = "#047857";
  let border = "#a7f3d0";

  if (pct < 80) {
    bg = "#fffbeb";
    color = "#b45309";
    border = "#fde68a";
  } else if (pct < 90) {
    bg = "#eff6ff";
    color = "#1d4ed8";
    border = "#bfdbfe";
  }

  return (
    <span
      className="badge"
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.71rem",
      }}
      title={`AI/Rule Match Confidence: ${pct}%`}
    >
      <Sparkles size={11} />
      <span>{pct}% match</span>
    </span>
  );
}

/**
 * Step 1: Column Mapping Studio Component.
 *
 * @param {object} props
 * @param {string} props.datasetId - UUID of the dataset
 * @param {Array<object|string>} props.columns - Raw source columns
 * @param {Array<object>|object} props.savedMappings - Active saved mappings
 * @param {Function} props.onMappingsSaved - Callback when mappings are persisted
 * @param {Function} props.onNext - Callback to transition to Step 2
 * @param {boolean} props.isLoading - Whether columns are loading
 */
export function Step1ColumnMapping({
  datasetId,
  columns = [],
  savedMappings = [],
  onMappingsSaved,
  onNext,
  isLoading = false,
}) {
  const standardFields = DEFAULT_STANDARD_FIELDS;
  const requiredFields = useMemo(
    () => standardFields.filter((f) => f.required),
    [standardFields],
  );
  const optionalFields = useMemo(
    () => standardFields.filter((f) => !f.required),
    [standardFields],
  );

  // Normalized list of source columns
  const normalizedColumns = useMemo(() => {
    if (!Array.isArray(columns)) return [];
    return columns.map(normalizeSourceColumn);
  }, [columns]);

  // Compute base mappings from columns and savedMappings
  const computeInitialMappings = () => {
    const initialMap = {};
    normalizedColumns.forEach((col) => {
      if (col.source_column) {
        initialMap[col.source_column] = col.mapped_column || "";
      }
    });
    const savedMap = extractMappingsMap(savedMappings);
    Object.entries(savedMap).forEach(([src, tgt]) => {
      initialMap[src] = tgt || "";
    });
    return initialMap;
  };

  // Local state for mappings: { [source_column]: target_column }
  const [mappings, setMappings] = useState(computeInitialMappings);
  // Confidence score tracker: { [source_column]: { confidence, target } }
  const [confidenceMap, setConfidenceMap] = useState({});
  // Track previous prop identity to synchronize state cleanly without effect cascading
  const [prevPropRef, setPrevPropRef] = useState({
    datasetId,
    savedMappings,
    columnsCount: normalizedColumns.length,
  });

  // UI states
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Preview Raw Dataset State
  const [showRawPreview, setShowRawPreview] = useState(false);
  const [rawPreviewData, setRawPreviewData] = useState(null);
  const [isLoadingRawPreview, setIsLoadingRawPreview] = useState(false);

  const handleToggleRawPreview = async () => {
    if (!showRawPreview && !rawPreviewData && datasetId) {
      setIsLoadingRawPreview(true);
      try {
        const preview = await pipelineService.getNormalizedPreview(datasetId, {
          page: 1,
          pageSize: 5,
          representation: "raw",
        });
        setRawPreviewData(preview);
      } catch (err) {
        console.error("Failed to load raw preview:", err);
      } finally {
        setIsLoadingRawPreview(false);
      }
    }
    setShowRawPreview((prev) => !prev);
  };

  // Synchronize state when datasetId, columns length, or savedMappings identity changes
  if (
    prevPropRef.datasetId !== datasetId ||
    prevPropRef.columnsCount !== normalizedColumns.length ||
    prevPropRef.savedMappings !== savedMappings
  ) {
    setPrevPropRef({
      datasetId,
      savedMappings,
      columnsCount: normalizedColumns.length,
    });
    setMappings(computeInitialMappings());
    setConfidenceMap({});
    setHasUnsavedChanges(false);
    setSaveSuccess(false);
    setError(null);
    setNotice(null);
  }

  // Map of target_column -> array of source_columns (to detect duplicates)
  const targetToSourcesMap = useMemo(() => {
    const map = new Map();
    Object.entries(mappings).forEach(([src, tgt]) => {
      if (tgt) {
        if (!map.has(tgt)) {
          map.set(tgt, []);
        }
        map.get(tgt).push(src);
      }
    });
    return map;
  }, [mappings]);

  // Duplicate target columns list
  const duplicateTargets = useMemo(() => {
    const dups = [];
    targetToSourcesMap.forEach((sources, target) => {
      if (sources.length > 1) {
        dups.push({ target, sources });
      }
    });
    return dups;
  }, [targetToSourcesMap]);

  const hasDuplicateTargets = duplicateTargets.length > 0;

  // Check which required fields are mapped
  const mappedRequiredCount = useMemo(() => {
    return requiredFields.filter((f) => targetToSourcesMap.has(f.name)).length;
  }, [requiredFields, targetToSourcesMap]);

  const allRequiredMapped = mappedRequiredCount === requiredFields.length;

  // Total mapped source columns
  const totalMappedColumns = useMemo(() => {
    return Object.values(mappings).filter(Boolean).length;
  }, [mappings]);

  // Handle select dropdown change
  const handleColumnTargetChange = (sourceCol, newTarget) => {
    setMappings((prev) => ({
      ...prev,
      [sourceCol]: newTarget || "",
    }));
    setHasUnsavedChanges(true);
    setSaveSuccess(false);
    setError(null);

    // Clear confidence score for manual adjustment
    setConfidenceMap((prev) => {
      const next = { ...prev };
      delete next[sourceCol];
      return next;
    });
  };

  // Clear single column mapping
  const handleClearColumn = (sourceCol) => {
    handleColumnTargetChange(sourceCol, "");
  };

  // Trigger intelligent rule-based suggestions
  const handleSuggestMappings = () => {
    setError(null);
    setSaveSuccess(false);

    try {
      if (normalizedColumns.length === 0) {
        setError("No dataset columns available to suggest mappings for.");
        return;
      }

      const suggestions =
        pipelineService.suggestColumnMappings(normalizedColumns);

      const nextMappings = { ...mappings };
      const nextConfidence = {};
      let suggestedCount = 0;

      suggestions.forEach((item) => {
        if (item && item.source_column) {
          if (item.target_column) {
            nextMappings[item.source_column] = item.target_column;
            nextConfidence[item.source_column] = {
              confidence: item.confidence,
              target: item.target_column,
            };
            suggestedCount++;
          } else {
            // Keep existing or leave unmapped
            if (!nextMappings[item.source_column]) {
              nextMappings[item.source_column] = "";
            }
          }
        }
      });

      setMappings(nextMappings);
      setConfidenceMap(nextConfidence);
      setHasUnsavedChanges(true);
      setNotice(
        `Suggested mappings calculated! Matched ${suggestedCount} field(s) to the pNEUMA UAV schema. Review selections and click "Save Mappings".`,
      );
    } catch (err) {
      setError(
        `Failed to compute mapping suggestions: ${err.message || String(err)}`,
      );
    }
  };

  // Save mappings to backend API
  const handleSaveMappings = async () => {
    if (!datasetId) {
      setError("Missing Dataset ID. Cannot save column mappings.");
      return;
    }

    if (hasDuplicateTargets) {
      const dupNames = duplicateTargets.map((d) => `"${d.target}"`).join(", ");
      setError(
        `Cannot save: Target field(s) ${dupNames} are assigned to multiple source columns. Each standard field must be unique.`,
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    setSaveSuccess(false);

    try {
      const payload = Object.entries(mappings).map(
        ([source_column, target_column]) => ({
          source_column,
          target_column: target_column || null,
        }),
      );

      const response = await pipelineService.saveColumnMappings(
        datasetId,
        payload,
      );
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setNotice("Column mappings successfully saved to database.");

      if (onMappingsSaved) {
        onMappingsSaved(payload, response);
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.message ||
        "Failed to save column mappings to server.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsSaving(false);
    }
  };

  // Reset mappings to saved state
  const handleResetMappings = () => {
    const initialMap = {};
    normalizedColumns.forEach((col) => {
      if (col.source_column) {
        initialMap[col.source_column] = col.mapped_column || "";
      }
    });
    const savedMap = extractMappingsMap(savedMappings);
    Object.entries(savedMap).forEach(([src, tgt]) => {
      initialMap[src] = tgt || "";
    });

    setMappings(initialMap);
    setConfidenceMap({});
    setHasUnsavedChanges(false);
    setSaveSuccess(false);
    setError(null);
    setNotice("Mappings reset to last saved state.");
  };

  // Navigate to Step 2
  const handleNextStep = async () => {
    if (!allRequiredMapped) {
      const missing = requiredFields
        .filter((f) => !targetToSourcesMap.has(f.name))
        .map((f) => f.name);
      setError(
        `Cannot proceed: Missing required pNEUMA field(s): ${missing.join(
          ", ",
        )}. Please map all 5 core fields before quality inspection.`,
      );
      return;
    }

    if (hasDuplicateTargets) {
      setError(
        "Cannot proceed: Conflicting duplicate target column assignments detected. Please resolve duplicates before proceeding.",
      );
      return;
    }

    // Auto-save if there are unsaved changes
    if (hasUnsavedChanges) {
      try {
        await handleSaveMappings();
      } catch {
        return;
      }
    }

    if (onNext) {
      onNext();
    }
  };

  if (isLoading) {
    return (
      <div className="admin-card">
        <div className="empty-state" style={{ padding: "3.5rem 1.5rem" }}>
          <RefreshCw
            size={30}
            className="animate-spin"
            style={{ margin: "0 auto 0.85rem", color: "#2563eb" }}
          />
          <h4
            style={{
              margin: "0 0 0.35rem 0",
              color: "#0f172a",
              fontWeight: 700,
            }}
          >
            Inspecting Dataset Columns...
          </h4>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>
            Fetching column headers, data types, and stored mappings.
          </p>
        </div>
      </div>
    );
  }

  if (normalizedColumns.length === 0) {
    return (
      <div className="admin-card">
        <div className="vivid-empty-box" style={{ margin: "2rem" }}>
          <div
            className="vivid-empty-box__icon"
            style={{ background: "#eff6ff", color: "#2563eb" }}
          >
            <Table size={26} />
          </div>
          <h4
            style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#0f172a" }}
          >
            No Dataset Columns Found
          </h4>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "0.85rem",
              maxWidth: "420px",
            }}
          >
            The selected dataset does not contain readable column headers.
            Please select another dataset or verify the original file upload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      {/* Studio Header & Action Bar */}
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--blue">
            <Layers size={18} />
          </div>
          <div>
            <h3 className="admin-card__title">
              Preview & Column Mapping Studio
            </h3>
            <p className="admin-card__subtitle"></p>
          </div>
        </div>

        {/* Action Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={handleToggleRawPreview}
            style={{
              padding: "0.42rem 0.75rem",
              fontSize: "0.8rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: showRawPreview ? "#eff6ff" : "#ffffff",
              color: showRawPreview ? "#1d4ed8" : "#334155",
              borderColor: showRawPreview ? "#bfdbfe" : "#cbd5e1",
            }}
          >
            <Eye size={14} />
            <span>
              {showRawPreview ? "Hide Raw Preview" : "Preview Raw Data"}
            </span>
          </button>
          {hasUnsavedChanges && (
            <span
              className="badge badge--pending"
              style={{ fontSize: "0.74rem", padding: "0.35rem 0.65rem" }}
            >
              Unsaved Changes
            </span>
          )}

          {saveSuccess && !hasUnsavedChanges && (
            <span
              className="badge badge--approved"
              style={{ fontSize: "0.74rem", padding: "0.35rem 0.65rem" }}
            >
              <Check size={13} />
              Saved
            </span>
          )}

          <button
            type="button"
            className="btn-action"
            onClick={handleSuggestMappings}
            title="Auto-match columns using pNEUMA alias heuristics"
            style={{
              background: "#f0fdf4",
              color: "#15803d",
              border: "1px solid #86efac",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Sparkles size={14} />
            <span>Suggest Mappings</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleResetMappings}
            title="Reset to last saved mappings"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action--primary"
            onClick={handleSaveMappings}
            disabled={isSaving || hasDuplicateTargets}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              opacity: isSaving || hasDuplicateTargets ? 0.65 : 1,
              cursor:
                isSaving || hasDuplicateTargets ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Mappings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Preview Raw Dataset Table */}
      {showRawPreview && (
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0f172a" }}
            >
              Uploaded Dataset Raw Sample Rows (First 5 records):
            </span>
            <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
              Format: Raw file representation
            </span>
          </div>

          {isLoadingRawPreview ? (
            <div
              style={{
                padding: "1rem",
                textAlign: "center",
                color: "#64748b",
                fontSize: "0.82rem",
              }}
            >
              <RefreshCw
                size={16}
                className="animate-spin"
                style={{ display: "inline", marginRight: "0.4rem" }}
              />
              Loading raw preview rows...
            </div>
          ) : rawPreviewData && rawPreviewData.rows?.length > 0 ? (
            <div
              style={{
                overflowX: "auto",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                background: "#ffffff",
              }}
            >
              <table
                className="admin-table"
                style={{ margin: 0, fontSize: "0.78rem" }}
              >
                <thead>
                  <tr>
                    {rawPreviewData.columns?.map((c) => (
                      <th
                        key={c.name || c}
                        style={{
                          whiteSpace: "nowrap",
                          padding: "0.45rem 0.65rem",
                        }}
                      >
                        {c.name || c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawPreviewData.rows.slice(0, 5).map((row, rIdx) => (
                    <tr key={rIdx}>
                      {rawPreviewData.columns?.map((c) => {
                        const colName = c.name || c;
                        return (
                          <td
                            key={colName}
                            style={{
                              whiteSpace: "nowrap",
                              padding: "0.4rem 0.65rem",
                            }}
                          >
                            {String(row[colName] ?? "")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                padding: "0.75rem",
                color: "#64748b",
                fontSize: "0.8rem",
                fontStyle: "italic",
              }}
            >
              No raw rows preview returned.
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "1.25rem 1.5rem 1.5rem" }}>
        {/* Error Alert Banner */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.65rem",
              padding: "0.85rem 1.1rem",
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: "10px",
              color: "#9f1239",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
              lineHeight: 1.45,
            }}
          >
            <AlertCircle
              size={18}
              color="#e11d48"
              style={{ flexShrink: 0, marginTop: "2px" }}
            />
            <div style={{ flex: 1 }}>
              <strong>Validation Error:</strong> {error}
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#9f1239",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Success / Info Notice Banner */}
        {notice && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.8rem 1.1rem",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px",
              color: "#166534",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
            }}
          >
            <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>{notice}</div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#166534",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Duplicate Conflict Warning Banner */}
        {hasDuplicateTargets && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.85rem 1.1rem",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: "10px",
              color: "#9a3412",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
            }}
          >
            <AlertTriangle
              size={18}
              color="#ea580c"
              style={{ flexShrink: 0 }}
            />
            <div>
              <strong>Duplicate Target Mapping Conflict:</strong> Multiple
              source columns are assigned to:{" "}
              {duplicateTargets.map((d) => (
                <span
                  key={d.target}
                  style={{
                    display: "inline-block",
                    background: "#ffedd5",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "4px",
                    fontWeight: 700,
                    margin: "0 0.25rem",
                  }}
                >
                  {d.target} ({d.sources.join(", ")})
                </span>
              ))}
              . Each standard field can only be assigned to one source column.
            </div>
          </div>
        )}

        {/* Validation Summary Card */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "1.15rem 1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "0.85rem",
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.92rem",
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                }}
              >
                <span>Core Trajectory Fields Validation</span>
                <span
                  className={`badge ${allRequiredMapped ? "badge--approved" : "badge--pending"}`}
                  style={{ fontSize: "0.71rem" }}
                >
                  {mappedRequiredCount} / 5 Required Mapped
                </span>
              </div>
              <div
                style={{
                  fontSize: "0.77rem",
                  color: "#64748b",
                  marginTop: "0.15rem",
                }}
              ></div>
            </div>

            <div
              style={{
                textAlign: "right",
                fontSize: "0.8rem",
                color: "#475569",
              }}
            >
              <strong>{totalMappedColumns}</strong> of{" "}
              {normalizedColumns.length} total source columns mapped
            </div>
          </div>

          {/* Mini Progress Bar */}
          <div
            style={{
              width: "100%",
              height: "7px",
              background: "#e2e8f0",
              borderRadius: "9999px",
              overflow: "hidden",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                width: `${(mappedRequiredCount / 5) * 100}%`,
                height: "100%",
                background: allRequiredMapped
                  ? "linear-gradient(90deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
                borderRadius: "9999px",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* Required Fields Pill Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
              gap: "0.65rem",
            }}
          >
            {requiredFields.map((field) => {
              const mappedSources = targetToSourcesMap.get(field.name) || [];
              const isMapped = mappedSources.length > 0;
              const isDup = mappedSources.length > 1;

              return (
                <div
                  key={field.name}
                  style={{
                    padding: "0.65rem 0.85rem",
                    borderRadius: "9px",
                    border: `1px solid ${
                      isDup ? "#fca5a5" : isMapped ? "#bbf7d0" : "#fed7aa"
                    }`,
                    background: isDup
                      ? "#fef2f2"
                      : isMapped
                        ? "#f0fdf4"
                        : "#fffbeb",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.2rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "0.84rem",
                        color: "#0f172a",
                        fontFamily: "monospace",
                      }}
                    >
                      {field.name}
                      <span style={{ color: "#dc2626", marginLeft: "0.2rem" }}>
                        *
                      </span>
                    </span>
                    {isMapped ? (
                      <CheckCircle2 size={15} color="#16a34a" />
                    ) : (
                      <AlertTriangle size={15} color="#d97706" />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      color: isDup
                        ? "#b91c1c"
                        : isMapped
                          ? "#166534"
                          : "#9a3412",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {isMapped ? (
                      <span>
                        Mapped: <strong>{mappedSources.join(", ")}</strong>
                      </span>
                    ) : (
                      <span style={{ fontWeight: 600 }}>
                        Unmapped (Required)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Optional Fields Chips */}
          <div
            style={{
              marginTop: "0.85rem",
              paddingTop: "0.75rem",
              borderTop: "1px dashed #cbd5e1",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.45rem",
              fontSize: "0.75rem",
              color: "#64748b",
            }}
          >
            <span style={{ fontWeight: 600 }}>Optional fields:</span>
            {optionalFields.map((field) => {
              const mappedSources = targetToSourcesMap.get(field.name) || [];
              const isMapped = mappedSources.length > 0;
              return (
                <span
                  key={field.name}
                  className="badge"
                  style={{
                    background: isMapped ? "#eff6ff" : "#f8fafc",
                    color: isMapped ? "#1d4ed8" : "#64748b",
                    border: `1px solid ${isMapped ? "#bfdbfe" : "#e2e8f0"}`,
                    fontSize: "0.7rem",
                    fontFamily: "monospace",
                  }}
                  title={
                    isMapped
                      ? `Mapped from: ${mappedSources.join(", ")}`
                      : `${field.description} (optional)`
                  }
                >
                  {field.name} {isMapped ? `✓ (${mappedSources[0]})` : ""}
                </span>
              );
            })}
          </div>
        </div>

        {/* Column Mapping Table */}
        <div
          style={{
            overflowX: "auto",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
          }}
        >
          <table className="admin-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: "45px", textAlign: "center" }}>#</th>
                <th>Source Column Header</th>
                <th style={{ width: "130px" }}>Inferred Type</th>
                <th style={{ minWidth: "280px" }}>Target pNEUMA UAV Field</th>
                <th style={{ width: "150px" }}>Confidence / Origin</th>
                <th style={{ width: "120px" }}>Status</th>
                <th style={{ width: "80px", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {normalizedColumns.map((col, idx) => {
                const targetValue = mappings[col.source_column] || "";
                const isMapped = Boolean(targetValue);
                const confInfo = confidenceMap[col.source_column];
                const sourcesUsingThisTarget = targetValue
                  ? targetToSourcesMap.get(targetValue) || []
                  : [];
                const isDuplicate = sourcesUsingThisTarget.length > 1;
                const isRequiredTarget = requiredFields.some(
                  (f) => f.name === targetValue,
                );

                return (
                  <tr
                    key={col.source_column || idx}
                    style={{
                      background: isDuplicate ? "#fff1f2" : undefined,
                    }}
                  >
                    <td
                      style={{
                        textAlign: "center",
                        fontSize: "0.78rem",
                        color: "#94a3b8",
                        fontWeight: 600,
                      }}
                    >
                      {idx + 1}
                    </td>

                    <td>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                          fontFamily: "monospace",
                          fontSize: "0.88rem",
                        }}
                      >
                        {col.source_column}
                      </div>
                    </td>

                    <td>
                      <DataTypeBadge type={col.data_type} />
                    </td>

                    <td>
                      <select
                        className="admin-select"
                        value={targetValue}
                        onChange={(e) =>
                          handleColumnTargetChange(
                            col.source_column,
                            e.target.value,
                          )
                        }
                        style={{
                          width: "100%",
                          maxWidth: "320px",
                          borderColor: isDuplicate
                            ? "#ef4444"
                            : isMapped
                              ? "#3b82f6"
                              : "#cbd5e1",
                          backgroundColor: isDuplicate ? "#fef2f2" : "#ffffff",
                          fontWeight: isMapped ? 600 : 400,
                          color: isMapped ? "#0f172a" : "#64748b",
                        }}
                      >
                        <option value="">-- Unmapped / Ignore --</option>
                        <optgroup label="Standard pNEUMA UAV Fields (10 fields)">
                          <option value="track_id">
                            track_id (Required - Trajectory ID)
                          </option>
                          <option value="lat">
                            lat (Required - Latitude WGS84)
                          </option>
                          <option value="lon">
                            lon (Required - Longitude WGS84)
                          </option>
                          <option value="speed">
                            speed (Required - Instant Speed km/h)
                          </option>
                          <option value="time">
                            time (Required - Elapsed Time s)
                          </option>
                          <option value="type">
                            type (Vehicle Class / Category)
                          </option>
                          <option value="traveled_d">
                            traveled_d (Traveled Distance m)
                          </option>
                          <option value="avg_speed">
                            avg_speed (Average Speed km/h)
                          </option>
                          <option value="lon_acc">
                            lon_acc (Longitudinal Accel m/s²)
                          </option>
                          <option value="lat_acc">
                            lat_acc (Lateral Accel m/s²)
                          </option>
                        </optgroup>
                      </select>

                      {isDuplicate && (
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "#b91c1c",
                            marginTop: "0.25rem",
                            fontWeight: 600,
                          }}
                        >
                          Target "{targetValue}" is also mapped to{" "}
                          {sourcesUsingThisTarget
                            .filter((s) => s !== col.source_column)
                            .join(", ")}
                        </div>
                      )}
                    </td>

                    <td>
                      {confInfo ? (
                        <ConfidenceBadge confInfo={confInfo} />
                      ) : isMapped ? (
                        <span
                          className="badge"
                          style={{
                            background: "#f8fafc",
                            color: "#475569",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.71rem",
                          }}
                        >
                          Manual
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                          —
                        </span>
                      )}
                    </td>

                    <td>
                      {isDuplicate ? (
                        <span className="badge badge--rejected">Duplicate</span>
                      ) : isMapped ? (
                        <span
                          className={`badge ${
                            isRequiredTarget
                              ? "badge--approved"
                              : "badge--engineer"
                          }`}
                        >
                          <Check size={11} />
                          {isRequiredTarget ? "Mapped (Req)" : "Mapped"}
                        </span>
                      ) : (
                        <span className="badge badge--inactive">Unmapped</span>
                      )}
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {isMapped ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleClearColumn(col.source_column)}
                          title="Unmap this column"
                          style={{
                            padding: "0.25rem 0.45rem",
                            fontSize: "0.72rem",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <X size={13} />
                        </button>
                      ) : (
                        <span style={{ color: "#cbd5e1" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Navigation & Step Transition */}
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid #f1f5f9",
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
              gap: "0.5rem",
              fontSize: "0.82rem",
              color: "#64748b",
            }}
          >
            <Info size={16} color="#3b82f6" />
            <span>
              {allRequiredMapped ? (
                <span style={{ color: "#166534", fontWeight: 600 }}>
                  Ready to proceed! All 5 core trajectory fields are mapped.
                </span>
              ) : (
                <span>
                  Map all 5 required fields (<code>track_id</code>,{" "}
                  <code>lat</code>, <code>lon</code>, <code>speed</code>,{" "}
                  <code>time</code>) to proceed to Step 2.
                </span>
              )}
            </span>
          </div>

          <button
            type="button"
            className="btn-action btn-action--primary"
            onClick={handleNextStep}
            disabled={!allRequiredMapped || hasDuplicateTargets || isSaving}
            style={{
              padding: "0.62rem 1.35rem",
              fontSize: "0.88rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.55rem",
              opacity:
                !allRequiredMapped || hasDuplicateTargets || isSaving
                  ? 0.55
                  : 1,
              cursor:
                !allRequiredMapped || hasDuplicateTargets || isSaving
                  ? "not-allowed"
                  : "pointer",
            }}
            title={
              !allRequiredMapped
                ? "Please map all 5 required fields before proceeding"
                : hasDuplicateTargets
                  ? "Please resolve duplicate column mappings before proceeding"
                  : "Proceed to Step 2: Data Quality Inspection"
            }
          >
            <span>Next: Data Quality Inspection</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Step1ColumnMapping;
