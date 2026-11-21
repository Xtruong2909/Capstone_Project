import { useCallback, useState } from 'react'

const PAGE_SIZE = 15

export default function useLagFeatureTable(samples) {
  const [page, setPage] = useState(1)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const totalPages = Math.max(1, Math.ceil(samples.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const closeSample = useCallback(() => setSelectedIndex(null), [])

  return {
    page: currentPage,
    pageSize: PAGE_SIZE,
    totalPages,
    pagedSamples: samples.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    selectedIndex,
    selectedSample: selectedIndex == null ? null : samples[selectedIndex] ?? null,
    openSample: setSelectedIndex,
    closeSample,
    previousPage: () => { setSelectedIndex(null); setPage((value) => Math.max(1, value - 1)) },
    nextPage: () => { setSelectedIndex(null); setPage((value) => Math.min(totalPages, value + 1)) },
    resetTable: () => { setPage(1); setSelectedIndex(null) },
    confirmRegenerate,
    setConfirmRegenerate,
  }
}
