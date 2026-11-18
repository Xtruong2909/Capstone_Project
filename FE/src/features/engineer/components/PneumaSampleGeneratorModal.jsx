import { useState, useEffect, useRef } from 'react'
import {
  X,
  Sparkles,
  Zap,
  CheckSquare,
  Square,
  Car,
  Bike,
  Bus,
  Truck,
  Layers,
  Database,
  AlertCircle,
} from 'lucide-react'
import {
  PNEUMA_VEHICLE_TYPES,
  VEHICLE_COUNT_OPTIONS,
  generatePneumaSampleFile,
  quickGeneratePneumaSampleFile,
  getSamplePoolMetadata,
} from '../utils/pneumaSampleGenerator'

const TYPE_META = {
  Car: { icon: Car, desc: 'Passenger cars & sedans' },
  Motorcycle: { icon: Bike, desc: 'Motorbikes & scooters' },
  Taxi: { icon: Car, desc: 'Licensed urban taxis' },
  Bus: { icon: Bus, desc: 'Public transit & coaches' },
  'Medium Vehicle': { icon: Truck, desc: 'Vans & delivery trucks' },
  'Heavy Vehicle': { icon: Truck, desc: 'Articulated haulers' },
}

export default function PneumaSampleGeneratorModal({ isOpen, onClose, onGenerate }) {
  const [selectedTypes, setSelectedTypes] = useState([...PNEUMA_VEHICLE_TYPES])
  const [vehicleCount, setVehicleCount] = useState(5)
  const [isCustomCount, setIsCustomCount] = useState(false)
  const [customInputValue, setCustomInputValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [poolMeta, setPoolMeta] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    getSamplePoolMetadata()
      .then((meta) => {
        if (isMountedRef.current) setPoolMeta(meta)
      })
      .catch(() => {})
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isGenerating, onClose])

  if (!isOpen) return null

  const handleToggleType = (type) => {
    if (isGenerating) return
    setErrorMsg(null)
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const handleSelectAll = () => {
    if (isGenerating) return
    setErrorMsg(null)
    setSelectedTypes([...PNEUMA_VEHICLE_TYPES])
  }

  const handleDeselectAll = () => {
    if (isGenerating) return
    setErrorMsg(null)
    setSelectedTypes([])
  }

  const handleQuickGenerate = async () => {
    if (isGenerating) return
    setIsGenerating(true)
    setErrorMsg(null)
    try {
      const result = await quickGeneratePneumaSampleFile()
      onGenerate?.(result.file, result.summary)
      onClose()
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMsg(err.message || 'Failed to generate quick sample dataset.')
      }
    } finally {
      if (isMountedRef.current) setIsGenerating(false)
    }
  }

  const handleGenerateCustom = async () => {
    if (isGenerating) return
    if (selectedTypes.length === 0) {
      setErrorMsg('Select at least one vehicle class to generate a sample.')
      return
    }

    setIsGenerating(true)
    setErrorMsg(null)
    try {
      const result = await generatePneumaSampleFile({
        selectedTypes,
        vehicleCount,
      })
      onGenerate?.(result.file, result.summary)
      onClose()
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMsg(err.message || 'Failed to generate custom sample dataset.')
      }
    } finally {
      if (isMountedRef.current) setIsGenerating(false)
    }
  }

  const isAllSelected = selectedTypes.length === PNEUMA_VEHICLE_TYPES.length
  const approxPoints = (vehicleCount || 5) * 180

  return (
    <div
      className="adm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pneuma-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating) onClose()
      }}
    >
      <div className="adm-modal" style={{ maxWidth: '660px' }}>
        <div className="adm-modal__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Sparkles size={18} style={{ color: '#60a5fa' }} />
            <h3 id="pneuma-modal-title" className="adm-modal__title">
              pNEUMA Sample CSV Generator
            </h3>
          </div>
          <button
            type="button"
            className="adm-modal__close"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="adm-modal__body">
          {errorMsg && (
            <div className="eng-alert eng-alert--error">
              <div className="eng-alert__content">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Section 1: Vehicle Class Selection */}
          <div style={{ marginBottom: '1.35rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.65rem',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Layers size={15} style={{ color: '#2563eb' }} />
                <span>
                  Vehicle Classes ({selectedTypes.length}/{PNEUMA_VEHICLE_TYPES.length})
                </span>
              </span>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={handleSelectAll}
                  disabled={isAllSelected || isGenerating}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={handleDeselectAll}
                  disabled={selectedTypes.length === 0 || isGenerating}
                >
                  Clear
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                gap: '0.6rem',
              }}
            >
              {PNEUMA_VEHICLE_TYPES.map((type) => {
                const isSelected = selectedTypes.includes(type)
                const meta = TYPE_META[type] || { icon: Car, desc: 'Vehicle trajectory' }
                const IconComp = meta.icon
                const availableCount = poolMeta?.byType?.[type]

                return (
                  <button
                    key={type}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleToggleType(type)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      padding: '0.75rem 0.85rem',
                      borderRadius: '10px',
                      border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      textAlign: 'left',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ color: isSelected ? '#2563eb' : '#94a3b8', marginTop: '1px' }}>
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.35rem',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          color: '#0f172a',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <IconComp size={14} style={{ color: isSelected ? '#2563eb' : '#64748b' }} />
                          {type}
                        </span>
                        {availableCount != null && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                            {availableCount}
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.74rem',
                          color: '#64748b',
                          marginTop: '0.15rem',
                        }}
                      >
                        {meta.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2: Vehicle Count */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.6rem',
                flexWrap: 'wrap',
              }}
            >
              <label
                htmlFor="pneuma-custom-count"
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Database size={15} style={{ color: '#2563eb' }} />
                <span>
                  Vehicle Count: <strong>{vehicleCount || 5}</strong> (~
                  {approxPoints.toLocaleString()} trajectory points)
                </span>
              </label>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Range: 1–100 vehicles</span>
            </div>

            <div className="adm-filter-pills" style={{ width: 'fit-content', flexWrap: 'wrap' }}>
              {VEHICLE_COUNT_OPTIONS.map((count) => {
                const isActive = vehicleCount === count && !isCustomCount
                return (
                  <button
                    key={count}
                    type="button"
                    disabled={isGenerating}
                    className={`adm-filter-pill ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setIsCustomCount(false)
                      setCustomInputValue('')
                      setVehicleCount(count)
                    }}
                  >
                    {count}
                  </button>
                )
              })}
              <input
                id="pneuma-custom-count"
                type="number"
                min={1}
                max={100}
                placeholder="Custom"
                aria-label="Custom vehicle count (1 to 100)"
                className="adm-input"
                style={{ width: '96px', minHeight: '34px', padding: '0.25rem 0.6rem' }}
                disabled={isGenerating}
                value={customInputValue}
                onChange={(e) => {
                  const val = e.target.value
                  setCustomInputValue(val)
                  setIsCustomCount(true)
                  const parsed = parseInt(val, 10)
                  if (!Number.isNaN(parsed)) {
                    setVehicleCount(Math.min(100, Math.max(1, parsed)))
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="adm-modal__footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={handleQuickGenerate}
            disabled={isGenerating}
            title="Generate 5 mixed vehicles immediately"
          >
            <Zap size={15} />
            <span>Quick 5-Vehicle Sample</span>
          </button>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={onClose}
              disabled={isGenerating}
            >
              Cancel
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={handleGenerateCustom}
              disabled={isGenerating || selectedTypes.length === 0}
            >
              <Sparkles size={15} />
              <span>{isGenerating ? 'Generating...' : 'Generate Sample CSV'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
