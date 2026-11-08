import {
  Check,
  Cpu,
  SplitSquareVertical,
  Sliders,
  ClipboardList,
  GitCompareArrows,
  ChevronRight,
} from 'lucide-react'

const TRAINING_STEPS = [
  {
    step: 1,
    title: '1. Tạo Lag Features',
    subtitle: 'Trích xuất mẫu X / Y',
    icon: Cpu,
  },
  {
    step: 2,
    title: '2. Chia Train/Test 70/30',
    subtitle: 'Chia theo thời gian',
    icon: SplitSquareVertical,
  },
  {
    step: 3,
    title: '3. Cấu hình & Chạy thí nghiệm',
    subtitle: 'Random Forest Regressor',
    icon: Sliders,
  },
  {
    step: 4,
    title: '4. Xem chi tiết thí nghiệm',
    subtitle: 'Danh sách & 3 bảng kết quả',
    icon: ClipboardList,
  },
  {
    step: 5,
    title: '5. So sánh thí nghiệm',
    subtitle: 'Đối chiếu theo Horizon',
    icon: GitCompareArrows,
  },
]

/**
 * 5-step progress stepper for the Model Training & Experiment workflow.
 */
export default function TrainingPipelineStepper({
  activeStep = 1,
  completedSteps = [],
  unlockedSteps = [1, 4, 5],
  onStepClick,
  sampleCount = 0,
  splitData = null,
  experimentCount = 0,
}) {
  const completedSet = new Set(completedSteps)
  const unlockedSet = new Set(unlockedSteps)

  const getStepBadgeText = (stepNumber) => {
    if (stepNumber === 1 && sampleCount > 0) return `${sampleCount} mẫu`
    if (stepNumber === 2 && splitData) {
      return `${splitData.train_count}/${splitData.test_count}`
    }
    if (stepNumber === 4 && experimentCount > 0) return `${experimentCount} Ex`
    return null
  }

  return (
    <div className="sci-train-stepper">
      <div className="sci-train-stepper__head">
        <div>
          <span className="sci-train-stepper__eyebrow">QUY TRÌNH HUẤN LUYỆN &amp; THÍ NGHIỆM MÔ HÌNH</span>
          <h3 className="sci-train-stepper__heading">
            Luồng tự động chuyển tiếp dữ liệu từ Lag Features → Chia 70/30 → Thí nghiệm Random Forest → So sánh
          </h3>
        </div>
        <span className="sci-pill sci-pill--version">
          Bước {activeStep} / 5
        </span>
      </div>

      <div className="sci-train-stepper__track">
        {TRAINING_STEPS.map((item, idx) => {
          const isActive = activeStep === item.step
          const isDone = completedSet.has(item.step) && !isActive
          const isClickable =
            unlockedSet.has(item.step) || completedSet.has(item.step) || isActive
          const Icon = item.icon
          const badgeText = getStepBadgeText(item.step)

          return (
            <div key={item.step} className="sci-train-stepper__item-wrap">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(item.step)}
                className={`sci-train-stepper__btn ${
                  isActive
                    ? 'sci-train-stepper__btn--active'
                    : isDone
                      ? 'sci-train-stepper__btn--done'
                      : 'sci-train-stepper__btn--upcoming'
                }`}
              >
                <div className="sci-train-stepper__circle">
                  {isDone ? <Check size={16} strokeWidth={2.8} /> : <Icon size={16} />}
                </div>

                <div className="sci-train-stepper__info">
                  <div className="sci-train-stepper__title-row">
                    <span className="sci-train-stepper__title">{item.title}</span>
                    {badgeText && (
                      <span className="sci-train-stepper__badge">{badgeText}</span>
                    )}
                  </div>
                  <span className="sci-train-stepper__sub">{item.subtitle}</span>
                </div>
              </button>

              {idx < TRAINING_STEPS.length - 1 && (
                <div
                  className={`sci-train-stepper__arrow ${
                    completedSet.has(item.step) ? 'sci-train-stepper__arrow--done' : ''
                  }`}
                >
                  <ChevronRight size={16} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

