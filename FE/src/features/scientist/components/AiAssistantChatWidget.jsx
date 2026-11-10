import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  MessageCircleMore,
  Sparkles,
  Send,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Sliders,
  TrendingUp,
  MessageSquare,
  Maximize2,
  Minimize2,
  Minus,
} from 'lucide-react'
import { useAiAssistant, useModelTrainingExperiments } from '../../../hooks/useTrafficForecast'

const QUICK_PROMPTS = [
  'Random Forest dự báo lưu lượng như thế nào?',
  'Lag features 5 bước và horizon +1, +3, +5 phút hoạt động ra sao?',
  'Sự khác nhau giữa chỉ số MAE và RMSE trong đánh giá mô hình?',
]

function extractVersionIdFromPath(pathname = '') {
  const match = pathname.match(/\/scientist\/datasets\/[^/]+\/versions\/([^/]+)/)
  return match ? match[1] : null
}

function renderAssistantResult(msg) {
  const res = msg.result || {}
  if (msg.isError) {
    return <div className="sci-ai-msg__error-text">{res.message || 'Đã xảy ra lỗi.'}</div>
  }

  return (
    <div className="sci-ai-msg__structured">
      {res.message && <p className="sci-ai-msg__p">{res.message}</p>}
      {res.summary && <p className="sci-ai-msg__p sci-ai-msg__summary">{res.summary}</p>}

      {Array.isArray(res.strengths) && res.strengths.length > 0 && (
        <div className="sci-ai-msg__block sci-ai-msg__block--good">
          <div className="sci-ai-msg__block-title">
            <CheckCircle2 size={13} /> Điểm mạnh
          </div>
          <ul>
            {res.strengths.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(res.weaknesses) && res.weaknesses.length > 0 && (
        <div className="sci-ai-msg__block sci-ai-msg__block--warn">
          <div className="sci-ai-msg__block-title">
            <AlertTriangle size={13} /> Hạn chế cần lưu ý
          </div>
          <ul>
            {res.weaknesses.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(res.recommendations) && res.recommendations.length > 0 && (
        <div className="sci-ai-msg__block sci-ai-msg__block--info">
          <div className="sci-ai-msg__block-title">
            <Lightbulb size={13} /> Khuyến nghị cải thiện
          </div>
          <ul>
            {res.recommendations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {res.suggested_configuration && (
        <div className="sci-ai-msg__config">
          <div className="sci-ai-msg__block-title">
            <Sliders size={13} /> Cấu hình Random Forest đề xuất
          </div>
          <div className="sci-ai-msg__config-grid">
            <span>
              n_estimators: <strong>{res.suggested_configuration.n_estimators}</strong>
            </span>
            <span>
              max_depth: <strong>{String(res.suggested_configuration.max_depth ?? 'None')}</strong>
            </span>
            <span>
              min_samples_split: <strong>{res.suggested_configuration.min_samples_split}</strong>
            </span>
            <span>
              min_samples_leaf: <strong>{res.suggested_configuration.min_samples_leaf}</strong>
            </span>
            <span>
              max_features: <strong>{String(res.suggested_configuration.max_features)}</strong>
            </span>
            <span>
              bootstrap: <strong>{String(res.suggested_configuration.bootstrap)}</strong>
            </span>
            <span>
              random_state: <strong>{res.suggested_configuration.random_state}</strong>
            </span>
          </div>
        </div>
      )}

      {res.reason && (
        <p className="sci-ai-msg__p sci-ai-msg__reason">
          <strong>Lý do đề xuất:</strong> {res.reason}
        </p>
      )}

      {res.best_experiment_id && (
        <div className="sci-ai-msg__badge">
          Thí nghiệm tốt nhất: <code>{String(res.best_experiment_id).slice(0, 12)}…</code>
        </div>
      )}

      {Array.isArray(res.forecast_trends) && res.forecast_trends.length > 0 && (
        <div className="sci-ai-msg__block sci-ai-msg__block--info">
          <div className="sci-ai-msg__block-title">
            <TrendingUp size={13} /> Xu hướng theo các mốc Horizon
          </div>
          <ul>
            {res.forecast_trends.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {res.explanation && <p className="sci-ai-msg__p">{res.explanation}</p>}
    </div>
  )
}

/**
 * Floating AI Assistant Chat Widget in the bottom-right corner of the screen.
 * Connects to POST /api/ai/assistant.
 */
export default function AiAssistantChatWidget() {
  const location = useLocation()
  const activeVersionId = useMemo(
    () => extractVersionIdFromPath(location.pathname),
    [location.pathname]
  )

  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [activeAction, setActiveAction] = useState('CHAT')
  const [inputMessage, setInputMessage] = useState('')
  const [selectedExpId, setSelectedExpId] = useState('')
  const [compareExpIds, setCompareExpIds] = useState([])
  const [predictionIdInput, setPredictionIdInput] = useState('1')

  const threadEndRef = useRef(null)

  const { messages, isSending, sendRequest, clearMessages } = useAiAssistant(activeVersionId)
  const { experiments, reloadExperiments } = useModelTrainingExperiments(activeVersionId)

  const completedExperiments = useMemo(
    () => experiments.filter((e) => e.status === 'COMPLETED'),
    [experiments]
  )

  // Refresh experiment list when opening widget on a dataset version route
  useEffect(() => {
    if (isOpen && activeVersionId) {
      reloadExperiments()
    }
  }, [isOpen, activeVersionId, reloadExperiments])

  const effectiveSelectedExpId = useMemo(() => {
    if (
      selectedExpId &&
      completedExperiments.some((e) => String(e.experiment_id) === String(selectedExpId))
    ) {
      return selectedExpId
    }
    return completedExperiments.length > 0 ? String(completedExperiments[0].experiment_id) : ''
  }, [selectedExpId, completedExperiments])

  const effectiveCompareExpIds = useMemo(() => {
    const valid = compareExpIds.filter((id) =>
      completedExperiments.some((e) => String(e.experiment_id) === String(id))
    )
    if (valid.length > 0) return valid
    return completedExperiments.slice(0, 2).map((e) => String(e.experiment_id))
  }, [compareExpIds, completedExperiments])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen, isSending])

  // Allow external panels (e.g. TrafficPredictionPanel) to open and prompt the AI widget
  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {}
      setIsOpen(true)
      setHasStarted(true)
      if (detail.action) {
        setActiveAction(detail.action)
      }
      if (detail.autoSend) {
        sendRequest(detail)
      }
    }
    window.addEventListener('sci-ai-assistant:open', handler)
    return () => window.removeEventListener('sci-ai-assistant:open', handler)
  }, [sendRequest])

  const handleToggleCompareExp = (id) => {
    const strId = String(id)
    setCompareExpIds(() => {
      const base = effectiveCompareExpIds
      return base.includes(strId) ? base.filter((item) => item !== strId) : [...base, strId]
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSending) return

    if (activeAction === 'CHAT') {
      const trimmed = inputMessage.trim()
      if (!trimmed) return
      setInputMessage('')
      await sendRequest({
        action: 'CHAT',
        message: trimmed,
        datasetVersionId: activeVersionId || undefined,
      })
      return
    }

    if (activeAction === 'EXPERIMENT_ANALYSIS') {
      if (!effectiveSelectedExpId) return
      const exp = completedExperiments.find(
        (x) => String(x.experiment_id) === effectiveSelectedExpId
      )
      const label = exp
        ? `Phân tích thí nghiệm ${exp.experiment_name}`
        : `Phân tích thí nghiệm ${effectiveSelectedExpId.slice(0, 8)}…`
      const extraMsg = inputMessage.trim() || undefined
      setInputMessage('')
      await sendRequest({
        action: 'EXPERIMENT_ANALYSIS',
        experimentIds: [effectiveSelectedExpId],
        datasetVersionId: activeVersionId || undefined,
        message: extraMsg,
        userDisplayLabel: extraMsg ? `${label}: ${extraMsg}` : label,
      })
      return
    }

    if (activeAction === 'MODEL_RECOMMENDATION') {
      if (!effectiveSelectedExpId) return
      const exp = completedExperiments.find(
        (x) => String(x.experiment_id) === effectiveSelectedExpId
      )
      const label = exp
        ? `Gợi ý cấu hình Random Forest từ ${exp.experiment_name}`
        : 'Gợi ý cấu hình Random Forest'
      const extraMsg = inputMessage.trim() || undefined
      setInputMessage('')
      await sendRequest({
        action: 'MODEL_RECOMMENDATION',
        experimentIds: [effectiveSelectedExpId],
        datasetVersionId: activeVersionId || undefined,
        message: extraMsg,
        userDisplayLabel: label,
      })
      return
    }

    if (activeAction === 'EXPERIMENT_COMPARISON') {
      if (effectiveCompareExpIds.length < 2) return
      const names = effectiveCompareExpIds
        .map((id) => {
          const found = completedExperiments.find((x) => String(x.experiment_id) === id)
          return found ? found.experiment_name : id.slice(0, 6)
        })
        .join(', ')
      const extraMsg = inputMessage.trim() || undefined
      setInputMessage('')
      await sendRequest({
        action: 'EXPERIMENT_COMPARISON',
        experimentIds: effectiveCompareExpIds,
        datasetVersionId: activeVersionId || undefined,
        message: extraMsg,
        userDisplayLabel: `So sánh các thí nghiệm: ${names}`,
      })
      return
    }

    if (activeAction === 'FORECAST_EXPLANATION') {
      const pid = Number(predictionIdInput)
      if (!Number.isInteger(pid) || pid < 1) return
      const extraMsg = inputMessage.trim() || undefined
      setInputMessage('')
      await sendRequest({
        action: 'FORECAST_EXPLANATION',
        predictionId: pid,
        datasetVersionId: activeVersionId || undefined,
        message: extraMsg,
        userDisplayLabel: `Giải thích kết quả dự báo #${pid}`,
      })
    }
  }

  const handleQuickPrompt = async (promptText) => {
    if (isSending) return
    setHasStarted(true)
    setActiveAction('CHAT')
    await sendRequest({
      action: 'CHAT',
      message: promptText,
      datasetVersionId: activeVersionId || undefined,
    })
  }

  const isSubmitDisabled = useMemo(() => {
    if (isSending) return true
    if (activeAction === 'CHAT') return !inputMessage.trim()
    if (activeAction === 'EXPERIMENT_ANALYSIS' || activeAction === 'MODEL_RECOMMENDATION') {
      return !effectiveSelectedExpId
    }
    if (activeAction === 'EXPERIMENT_COMPARISON') {
      return effectiveCompareExpIds.length < 2
    }
    if (activeAction === 'FORECAST_EXPLANATION') {
      const pid = Number(predictionIdInput)
      return !Number.isInteger(pid) || pid < 1
    }
    return false
  }, [
    isSending,
    activeAction,
    inputMessage,
    effectiveSelectedExpId,
    effectiveCompareExpIds.length,
    predictionIdInput,
  ])

  const conversationMessages = messages.filter((msg) => msg.id !== 'welcome')
  const showWelcome = !hasStarted && conversationMessages.length === 0

  const handleReset = () => {
    clearMessages()
    setActiveAction('CHAT')
    setInputMessage('')
    setHasStarted(false)
  }

  return (
    <div className="sci-ai-widget">
      {/* Floating Chat Box Window */}
      {isOpen && (
        <aside
          className={`sci-ai-box ${isExpanded ? 'sci-ai-box--expanded' : ''}`}
          aria-label="Trợ lý AI Data Scientist"
        >
          {/* Header */}
          <div className="sci-ai-box__header">
            <div className="sci-ai-box__brand">
              <div className="sci-ai-box__avatar" aria-hidden="true">
                <MessageCircleMore size={23} strokeWidth={2.2} />
              </div>
              <div>
                <h3 className="sci-ai-box__title">Trợ lý AI</h3>
                <span className="sci-ai-box__subtitle">Data Scientist · Phân tích giao thông</span>
              </div>
            </div>

            <div className="sci-ai-box__header-actions">
              {!showWelcome && (
                <button
                  type="button"
                  className="sci-ai-icon-btn"
                  onClick={handleReset}
                  disabled={isSending}
                  aria-label="Làm mới hội thoại"
                  title="Làm mới hội thoại"
                >
                  <RotateCcw size={17} />
                </button>
              )}
              <button
                type="button"
                className="sci-ai-icon-btn"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-label={isExpanded ? 'Thu nhỏ cửa sổ chat' : 'Phóng to cửa sổ chat'}
                title={isExpanded ? 'Thu nhỏ cửa sổ chat' : 'Phóng to cửa sổ chat'}
              >
                {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button
                type="button"
                className="sci-ai-icon-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Thu gọn Trợ lý AI"
                title="Thu gọn Trợ lý AI"
              >
                <Minus size={19} />
              </button>
            </div>
          </div>

          {showWelcome ? (
            <div className="sci-ai-welcome">
              <div className="sci-ai-welcome__intro">
                <div className="sci-ai-welcome__icon">
                  <MessageCircleMore size={23} strokeWidth={2.2} />
                </div>
                <h4>Xin chào Anh/Chị!</h4>
                <p>Em sẵn sàng hỗ trợ phân tích dữ liệu, thí nghiệm và dự báo giao thông.</p>
              </div>
              <button
                type="button"
                className="sci-ai-start-btn"
                onClick={() => {
                  setActiveAction('CHAT')
                  setHasStarted(true)
                }}
              >
                Bắt đầu chat
              </button>
            </div>
          ) : (
            <>
          {/* Context Selectors for specialized actions */}
          {activeAction !== 'CHAT' && (
            <div className="sci-ai-context-bar">
              {(activeAction === 'EXPERIMENT_ANALYSIS' ||
                activeAction === 'MODEL_RECOMMENDATION') && (
                <div className="sci-ai-context-field">
                  <label>Chọn thí nghiệm COMPLETED:</label>
                  {completedExperiments.length === 0 ? (
                    <span className="sci-ai-context-empty">
                      Chưa có thí nghiệm COMPLETED trong Dataset này (hãy mở trang Training/Prediction của một Dataset).
                    </span>
                  ) : (
                    <select
                      value={effectiveSelectedExpId}
                      onChange={(e) => setSelectedExpId(e.target.value)}
                      className="sci-ai-select"
                    >
                      {completedExperiments.map((exp) => (
                        <option key={exp.experiment_id} value={exp.experiment_id}>
                          {exp.experiment_name} ({String(exp.experiment_id).slice(0, 8)}…)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {activeAction === 'EXPERIMENT_COMPARISON' && (
                <div className="sci-ai-context-field">
                  <label>Chọn ít nhất 2 thí nghiệm để AI so sánh:</label>
                  {completedExperiments.length < 2 ? (
                    <span className="sci-ai-context-empty">
                      Cần ít nhất 2 thí nghiệm COMPLETED trong Dataset hiện tại để so sánh.
                    </span>
                  ) : (
                    <div className="sci-ai-exp-chips">
                      {completedExperiments.map((exp) => {
                        const id = String(exp.experiment_id)
                        const checked = effectiveCompareExpIds.includes(id)
                        return (
                          <button
                            key={id}
                            type="button"
                            className={`sci-ai-exp-chip ${
                              checked ? 'sci-ai-exp-chip--selected' : ''
                            }`}
                            onClick={() => handleToggleCompareExp(id)}
                          >
                            {exp.experiment_name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeAction === 'FORECAST_EXPLANATION' && (
                <div className="sci-ai-context-field">
                  <label htmlFor="ai-pred-id-input">
                    Nhập ID bản ghi dự báo (<code>prediction_id</code> trong <code>forecast_results</code>):
                  </label>
                  <input
                    id="ai-pred-id-input"
                    type="number"
                    min="1"
                    step="1"
                    className="sci-ai-select"
                    value={predictionIdInput}
                    onChange={(e) => setPredictionIdInput(e.target.value)}
                    placeholder="Ví dụ: 1"
                  />
                </div>
              )}
            </div>
          )}

          {/* Messages Thread */}
          <div className="sci-ai-thread">
            {conversationMessages.map((msg) => (
              <div
                key={msg.id}
                className={`sci-ai-msg ${
                  msg.role === 'user' ? 'sci-ai-msg--user' : 'sci-ai-msg--assistant'
                } ${msg.isError ? 'sci-ai-msg--error' : ''}`}
              >
                <div className="sci-ai-msg__bubble">
                  {msg.role === 'user' ? (
                    <p className="sci-ai-msg__p">{msg.text}</p>
                  ) : (
                    renderAssistantResult(msg)
                  )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="sci-ai-msg sci-ai-msg--assistant">
                <div className="sci-ai-msg__bubble sci-ai-msg__typing">
                  <Loader2 size={14} className="sci-spin" />
                  <span>Trợ lý AI đang phân tích dữ liệu...</span>
                </div>
              </div>
            )}

            {activeAction === 'CHAT' && conversationMessages.length === 0 && !isSending && (
              <div className="sci-ai-empty-state">
                <p>Em có thể giúp gì cho Anh/Chị?</p>
                <div className="sci-ai-suggestions">
                  {activeVersionId && (
                    <button
                      type="button"
                      className="sci-ai-suggestion-chip"
                      onClick={() => handleQuickPrompt('Phân tích dataset này và cho tôi biết chất lượng dữ liệu.')}
                    >
                      <MessageSquare size={15} />
                      <span>Phân tích dataset này</span>
                    </button>
                  )}
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="sci-ai-suggestion-chip"
                      onClick={() => handleQuickPrompt(q)}
                    >
                      <MessageSquare size={15} />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="sci-ai-box__footer">
            <input
              type="text"
              className="sci-ai-input"
              placeholder={
                activeAction === 'CHAT'
                  ? 'Hỏi AI về dataset, thí nghiệm, dự báo...'
                  : 'Ghi chú câu hỏi bổ sung (tuỳ chọn)...'
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isSending}
            />
            <button
              type="submit"
              className="sci-ai-send-btn"
              disabled={isSubmitDisabled}
              title="Gửi yêu cầu tới Trợ lý AI"
            >
              {isSending ? <Loader2 size={16} className="sci-spin" /> : <Send size={16} />}
            </button>
          </form>
            </>
          )}
        </aside>
      )}

      {/* Floating Toggle Button in bottom-right corner */}
      {!isOpen && (
        <button
          type="button"
          className="sci-ai-fab"
          onClick={() => setIsOpen(true)}
          aria-label="Mở Trợ lý AI Data Scientist"
          title="Trợ lý AI Data Scientist (Gemini)"
        >
          <MessageCircleMore size={27} strokeWidth={2.1} />
          <span className="sci-ai-fab__sparkle" aria-hidden="true">
            <Sparkles size={13} strokeWidth={2.4} />
          </span>
        </button>
      )}
    </div>
  )
}
