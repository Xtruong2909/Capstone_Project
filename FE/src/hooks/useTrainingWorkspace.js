import { useState } from 'react'

export function useTrainingWorkspace(initialTab = 'preparation') {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [showSplitDetails, setShowSplitDetails] = useState(false)
  const [comparisonOpen, setComparisonOpen] = useState(false)

  return {
    activeTab,
    setActiveTab,
    showSplitDetails,
    setShowSplitDetails,
    comparisonOpen,
    setComparisonOpen,
  }
}
