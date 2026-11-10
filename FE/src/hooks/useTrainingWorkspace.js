import { useState } from 'react'

export function useTrainingWorkspace() {
  const [activeTab, setActiveTab] = useState('preparation')
  const [openPreparation, setOpenPreparation] = useState('aggregation')
  const [comparisonOpen, setComparisonOpen] = useState(false)

  return {
    activeTab,
    setActiveTab,
    openPreparation,
    setOpenPreparation,
    comparisonOpen,
    setComparisonOpen,
  }
}
