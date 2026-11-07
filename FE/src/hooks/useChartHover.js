import { useState } from 'react'

/** Map pointer coordinates into the responsive SVG and select the nearest sample. */
export function useChartHover(points, bounds) {
  const [selection, setSelection] = useState(null)
  const activePoint = selection?.points === points ? points?.[selection.index] : null

  const clearHover = () => setSelection(null)
  const onPointerMove = (event) => {
    const svg = event.currentTarget
    const matrix = svg.getScreenCTM()
    if (!matrix || !points?.length) return
    const cursor = svg.createSVGPoint()
    cursor.x = event.clientX
    cursor.y = event.clientY
    const { x, y } = cursor.matrixTransform(matrix.inverse())
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
      clearHover()
      return
    }
    const index = points.reduce((nearest, point, current) => (
      Math.abs(point.x - x) < Math.abs(points[nearest].x - x) ? current : nearest
    ), 0)
    setSelection({ points, index })
  }

  const onKeyDown = (event) => {
    if (!points?.length) return
    if (event.key === 'Escape') return clearHover()
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const current = selection?.points === points ? selection.index : -1
    const index = current < 0 ? 0 : Math.max(0, Math.min(
      points.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1),
    ))
    setSelection({ points, index })
  }

  return {
    activePoint,
    hoverHandlers: { onPointerMove, onPointerLeave: clearHover, onPointerCancel: clearHover, onBlur: clearHover, onKeyDown },
  }
}
