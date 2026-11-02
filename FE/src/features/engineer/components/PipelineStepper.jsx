import { Check, Layers, ShieldCheck, Table2 } from "lucide-react";

/**
 * Default definitions for the 3 sequential steps in the Data Pipeline Studio.
 */
const PIPELINE_STEPS = [
  {
    step: 1,
    title: "Column Mapping Studio",
    shortTitle: "Column Mapping",
    icon: Layers,
  },
  {
    step: 2,
    title: "Data Quality Check",
    shortTitle: "Quality Check",
    icon: ShieldCheck,
  },
  {
    step: 3,
    title: "Normalize, Export & Submit",
    shortTitle: "Normalize & Submit",
    icon: Table2,
  },
];

/**
 * Reusable sequential pipeline stepper component.
 *
 * Visual states:
 * - Active: Vibrant primary blue background, glowing focus ring & elevation
 * - Completed: Emerald green background with checkmark icon, clickable to navigate back
 * - Upcoming: Neutral muted background, disabled cursor
 *
 * @param {object} props
 * @param {number} props.activeStep - Currently active step (1, 2, or 3)
 * @param {number[]|Set<number>} [props.completedSteps] - Set/array of completed step numbers
 * @param {Function} [props.onStepClick] - Callback invoked when a clickable step is clicked
 * @param {Array<object>} [props.steps] - Custom steps array (defaults to PIPELINE_STEPS)
 */
export default function PipelineStepper({
  activeStep = 1,
  completedSteps = [],
  onStepClick,
  steps = PIPELINE_STEPS,
}) {
  // Normalize completedSteps into a Set for fast lookup
  const completedSet = new Set(
    Array.isArray(completedSteps)
      ? completedSteps
      : completedSteps instanceof Set
        ? Array.from(completedSteps)
        : [],
  );

  const isStepCompleted = (stepNumber) => {
    return completedSet.has(stepNumber) || stepNumber < activeStep;
  };

  const isStepClickable = (stepNumber) => {
    // Allows clicking back to previously completed steps or current active step
    return isStepCompleted(stepNumber) || stepNumber === activeStep;
  };

  return (
    <div
      className="pipeline-stepper"
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "1.1rem 1.4rem",
        marginBottom: "1.5rem",
        boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        {steps.map((item, index) => {
          const stepNumber = item.step;
          const isActive = activeStep === stepNumber;
          const isCompleted = isStepCompleted(stepNumber) && !isActive;
          const isUpcoming = !isActive && !isCompleted;
          const clickable = isStepClickable(stepNumber);
          const StepIcon = item.icon || Layers;
          const isLast = index === steps.length - 1;

          return (
            <div
              key={stepNumber}
              style={{
                display: "flex",
                alignItems: "center",
                flex: "1 1 240px",
                minWidth: "220px",
              }}
            >
              {/* Step Button Card */}
              <button
                type="button"
                onClick={() => clickable && onStepClick?.(stepNumber)}
                disabled={!clickable}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.9rem",
                  padding: "0.65rem 0.95rem",
                  borderRadius: "12px",
                  border: isActive
                    ? "1.5px solid #2563eb"
                    : isCompleted
                      ? "1.5px solid #a7f3d0"
                      : "1px solid #f1f5f9",
                  background: isActive
                    ? "#eff6ff"
                    : isCompleted
                      ? "#f0fdf4"
                      : "#f8fafc",
                  cursor: clickable ? "pointer" : "not-allowed",
                  opacity: isUpcoming ? 0.65 : 1,
                  textAlign: "left",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: isActive
                    ? "0 0 0 3px rgba(37, 99, 235, 0.15), 0 4px 12px rgba(37, 99, 235, 0.08)"
                    : "none",
                  flex: 1,
                }}
                title={
                  clickable
                    ? `Navigate to ${item.title}`
                    : `Complete previous steps before accessing ${item.title}`
                }
              >
                {/* Step Circle / Badge */}
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontWeight: 700,
                    fontSize: "0.86rem",
                    transition: "all 0.2s ease",
                    ...(isActive
                      ? {
                          background: "#2563eb",
                          color: "#ffffff",
                          boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.25)",
                        }
                      : isCompleted
                        ? {
                            background: "#10b981",
                            color: "#ffffff",
                            boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.2)",
                          }
                        : {
                            background: "#e2e8f0",
                            color: "#64748b",
                          }),
                  }}
                >
                  {isCompleted ? (
                    <Check size={18} strokeWidth={2.8} />
                  ) : (
                    <StepIcon size={18} strokeWidth={isActive ? 2.3 : 1.9} />
                  )}
                </div>

                {/* Step Text Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      marginBottom: "0.15rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: isActive
                          ? "#1d4ed8"
                          : isCompleted
                            ? "#059669"
                            : "#64748b",
                      }}
                    >
                      Step 0{stepNumber}
                    </span>

                    {isCompleted && (
                      <span
                        style={{
                          fontSize: "0.66rem",
                          fontWeight: 700,
                          padding: "0.08rem 0.4rem",
                          borderRadius: "999px",
                          background: "#dcfce7",
                          color: "#15803d",
                          border: "1px solid #86efac",
                        }}
                      >
                        Done
                      </span>
                    )}

                    {isActive && (
                      <span
                        style={{
                          fontSize: "0.66rem",
                          fontWeight: 700,
                          padding: "0.08rem 0.45rem",
                          borderRadius: "999px",
                          background: "#dbeafe",
                          color: "#1e40af",
                          border: "1px solid #93c5fd",
                        }}
                      >
                        In Progress
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "0.86rem",
                      fontWeight: isActive || isCompleted ? 700 : 600,
                      color: isActive
                        ? "#0f172a"
                        : isCompleted
                          ? "#064e3b"
                          : "#475569",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.title}
                  </div>

                  <div
                    style={{
                      fontSize: "0.73rem",
                      color: "#64748b",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: "0.08rem",
                    }}
                  >
                    {item.subtitle}
                  </div>
                </div>
              </button>

              {/* Step Connector Line */}
              {!isLast && (
                <div
                  style={{
                    width: "28px",
                    height: "2px",
                    margin: "0 0.4rem",
                    background: isStepCompleted(stepNumber)
                      ? "#10b981"
                      : "#e2e8f0",
                    transition: "background-color 0.3s ease",
                    flexShrink: 0,
                  }}
                  className="pipeline-stepper__connector"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
