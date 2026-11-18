import { Check, Layers, ShieldCheck, Table2 } from 'lucide-react'

const PIPELINE_STEPS = [
  {
    step: 1,
    title: 'Column Mapping Studio',
    icon: Layers,
  },
  {
    step: 2,
    title: 'Data Quality Check',
    icon: ShieldCheck,
  },
  {
    step: 3,
    title: 'Normalize, Export & Submit',
    icon: Table2,
  },
]

export default function PipelineStepper({
  activeStep = 1,
  completedSteps = [],
  onStepClick,
  steps = PIPELINE_STEPS,
}) {
  const completedSet = new Set(
    Array.isArray(completedSteps)
      ? completedSteps
      : completedSteps instanceof Set
        ? Array.from(completedSteps)
        : []
  )

  const isStepCompleted = (stepNumber) =>
    completedSet.has(stepNumber) || stepNumber < activeStep

  const isStepClickable = (stepNumber) =>
    isStepCompleted(stepNumber) || stepNumber === activeStep

  return (
    <nav className="eng-stepper" aria-label="Pipeline Steps">
      {steps.map((item) => {
        const stepNumber = item.step
        const isActive = activeStep === stepNumber
        const isCompleted = isStepCompleted(stepNumber) && !isActive
        const clickable = isStepClickable(stepNumber)
        const StepIcon = item.icon || Layers

        return (
          <button
            key={stepNumber}
            type="button"
            disabled={!clickable}
            aria-current={isActive ? 'step' : undefined}
            className={`eng-step-btn ${isActive ? 'is-active' : ''} ${
              isCompleted ? 'is-completed' : ''
            }`}
            onClick={() => {
              if (clickable && typeof onStepClick === 'function') {
                onStepClick(stepNumber)
              }
            }}
          >
            <span className="eng-step-btn__num">
              {isCompleted ? <Check size={15} strokeWidth={2.5} /> : stepNumber}
            </span>
            <span className="eng-step-btn__text">
              <span className="eng-step-btn__label">Step {stepNumber} of {steps.length}</span>
              <span className="eng-step-btn__title">{item.title}</span>
            </span>
            <StepIcon size={16} style={{ flexShrink: 0, opacity: isActive ? 0.9 : 0.55 }} />
          </button>
        )
      })}
    </nav>
  )
}
