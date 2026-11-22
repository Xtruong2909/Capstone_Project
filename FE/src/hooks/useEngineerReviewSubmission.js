import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export function useEngineerReviewSubmission({ workflow, hasRejected, comment, disabled }) {
  const navigate = useNavigate()
  const request = useRef({ active: true, pending: false })
  useEffect(() => {
    const guard = { active: true, pending: false }
    request.current = guard
    return () => { guard.active = false }
  }, [])

  return async () => {
    const guard = request.current
    if (disabled || !guard.active || guard.pending) return
    guard.pending = true
    try {
      const success = await (hasRejected ? workflow.resubmit() : workflow.submit(comment))
      if (success && guard.active) navigate('/engineer/datasets', {
        replace: true,
        state: { reviewSubmitted: hasRejected ? 'resubmitted' : 'submitted' },
      })
    } finally {
      guard.pending = false
    }
  }
}

export function useEngineerCatalogNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const submitted = location.state?.reviewSubmitted
  const [notice, setNotice] = useState(() => submitted === 'submitted'
    ? 'Đã gửi batch phê duyệt thành công. Bạn có thể theo dõi trạng thái tại danh mục tập dữ liệu.'
    : submitted === 'resubmitted' ? 'Đã gửi lại batch phê duyệt thành công. Bạn có thể theo dõi trạng thái tại danh mục tập dữ liệu.' : '')
  useEffect(() => {
    if (!submitted) return
    // Consume the navigation notice so refresh/back does not announce another submission.
    const state = { ...location.state }
    delete state.reviewSubmitted
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
  }, [submitted, location.pathname, location.search, location.hash, location.state, navigate])
  return { notice, dismiss: () => setNotice('') }
}
