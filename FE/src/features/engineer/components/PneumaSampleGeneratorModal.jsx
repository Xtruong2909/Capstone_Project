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
  Info,
} from 'lucide-react'
import {
  PNEUMA_VEHICLE_TYPES,
  VEHICLE_COUNT_OPTIONS,
  generatePneumaSampleFile,
  quickGeneratePneumaSampleFile,
  getSamplePoolMetadata,
} from '../utils/pneumaSampleGenerator'

const TYPE_CONFIG = {
  Car: {
    icon: Car,
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    desc: 'Passenger cars & sedans',
  },
  Motorcycle: {
    icon: Bike,
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    desc: 'Motorbikes & scooters',
  },
  Taxi: {
    icon: Car,
    color: '#ca8a04',
    bg: '#fefce8',
    border: '#fef08a',
    desc: 'Licensed urban taxis',
  },
  Bus: {
    icon: Bus,
    color: '#059669',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    desc: 'Public transit & coaches',
  },
  'Medium Vehicle': {
    icon: Truck,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    desc: 'Vans & delivery trucks',
  },
  'Heavy Vehicle': {
    icon: Truck,
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    desc: 'Articulated trucks & haulers',
  },
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
      if (onGenerate) {
        onGenerate(result.file, result.summary)
      }
      onClose()
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMsg(err.message || 'Failed to generate quick sample dataset.')
      }
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false)
      }
    }
  }

  const handleGenerateCustom = async () => {
    if (isGenerating) return
    if (selectedTypes.length === 0) {
      setErrorMsg('Please select at least one vehicle type to include in the dataset.')
      return
    }

    setIsGenerating(true)
    setErrorMsg(null)
    try {
      const result = await generatePneumaSampleFile({
        selectedTypes,
        vehicleCount,
      })
      if (onGenerate) {
        onGenerate(result.file, result.summary)
      }
      onClose()
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMsg(err.message || 'Failed to generate custom sample dataset.')
      }
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false)
      }
    }
  }

  const isAllSelected = selectedTypes.length === PNEUMA_VEHICLE_TYPES.length
  const approxPoints = vehicleCount * 180

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating) onClose()
      }}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pneuma-modal-title"
        style={{
          maxWidth: '680px',
          width: '92%',
          maxHeight: 'min(90vh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            background: 'linear-gradient(135deg, #0e2646 0%, #1b4275 100%)',
            color: '#ffffff',
            padding: '1.25rem 1.5rem',
            borderBottom: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} color="#93c5fd" />
            </div>
            <div>
              <h3 id="pneuma-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: '#ffffff', fontWeight: 700 }}>
                Generate Genuine pNEUMA UAV Sample
              </h3>
              <p
                style={{
                  margin: '0.15rem 0 0 0',
                  fontSize: '0.78rem',
                  color: '#bfdbfe',
                }}
              >
                Extract calibrated trajectories directly from genuine Athens drone recordings (EPFL Open Traffic).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            style={{ color: '#ffffff', background: 'transparent', opacity: 0.8 }}
            onClick={onClose}
            disabled={isGenerating}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '1.35rem 1.5rem' }}>
          {/* Quick 1-Click Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '0.85rem 1.1rem',
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              borderRadius: '12px',
              marginBottom: '1.35rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Zap size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a' }}>
                  Quick 1-Click Balanced Benchmark
                </div>
                <div style={{ fontSize: '0.74rem', color: '#3b82f6' }}>
                  Instantly produces a 5-vehicle balanced sample across major vehicle types.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              style={{
                fontSize: '0.82rem',
                padding: '0.45rem 0.95rem',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
              onClick={handleQuickGenerate}
              disabled={isGenerating}
            >
              <Zap size={14} />
              <span>{isGenerating ? 'Generating...' : 'Quick 1-Click Generate'}</span>
            </button>
          </div>

          {/* Section 1: Vehicle Types Multi-Select */}
          <div style={{ marginBottom: '1.35rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.65rem',
              }}
            >
              <label
                style={{
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Layers size={16} color="#2563eb" />
                <span>Vehicle Types Multi-Select ({selectedTypes.length}/6 selected)</span>
              </label>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={isGenerating}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: isAllSelected ? '#f1f5f9' : '#ffffff',
                    color: isGenerating ? '#94a3b8' : '#334155',
                    fontSize: '0.73rem',
                    fontWeight: 600,
                    padding: '0.22rem 0.55rem',
                    borderRadius: '6px',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    opacity: isGenerating ? 0.6 : 1,
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={isGenerating}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: isGenerating ? '#94a3b8' : '#64748b',
                    fontSize: '0.73rem',
                    fontWeight: 600,
                    padding: '0.22rem 0.55rem',
                    borderRadius: '6px',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    opacity: isGenerating ? 0.6 : 1,
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Grid of 6 Types */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
                gap: '0.65rem',
              }}
            >
              {PNEUMA_VEHICLE_TYPES.map((type) => {
                const isSelected = selectedTypes.includes(type)
                const config = TYPE_CONFIG[type] || {
                  color: '#475569',
                  bg: '#f8fafc',
                  border: '#cbd5e1',
                  desc: '',
                }
                const IconComponent = config.icon || Car
                const availableCount = poolMeta?.type_counts?.[type] ?? 25

                return (
                  <div
                    key={type}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-disabled={isGenerating}
                    tabIndex={isGenerating ? -1 : 0}
                    onClick={() => !isGenerating && handleToggleType(type)}
                    onKeyDown={(e) => {
                      if (!isGenerating && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault()
                        handleToggleType(type)
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.65rem 0.8rem',
                      borderRadius: '10px',
                      border: isSelected
                        ? `2px solid ${config.color}`
                        : '1.5px solid #e2e8f0',
                      background: isSelected ? config.bg : '#ffffff',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      opacity: isGenerating ? 0.65 : 1,
                      transition: 'all 0.15s ease',
                      userSelect: 'none',
                    }}
                  >
                    <div
                      style={{
                        color: isSelected ? config.color : '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: isSelected ? '#0f172a' : '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <IconComponent size={14} color={isSelected ? config.color : '#64748b'} />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {type}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          marginTop: '0.1rem',
                        }}
                      >
                        {availableCount} in genuine pool
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Number of Vehicles Selector & Custom Input */}
          <div style={{ marginBottom: '1.35rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.55rem',
              }}
            >
              <label
                style={{
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Database size={15} color="#2563eb" />
                <span>
                  Số lượng phương tiện:{' '}
                  <strong style={{ color: '#2563eb' }}>{vehicleCount || 5} xe</strong>
                </span>
              </label>

              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                (Tùy chọn tự do từ 1 đến 100 xe từ tập pNEUMA thật)
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.65rem',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {VEHICLE_COUNT_OPTIONS.map((count) => {
                const isActive = vehicleCount === count && !isCustomCount
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      if (isGenerating) return
                      setIsCustomCount(false)
                      setVehicleCount(count)
                      setCustomInputValue('')
                    }}
                    disabled={isGenerating}
                    style={{
                      flex: '1 1 65px',
                      padding: '0.55rem 0.85rem',
                      borderRadius: '10px',
                      border: isActive ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: isActive ? '#eff6ff' : '#ffffff',
                      color: isGenerating ? '#94a3b8' : isActive ? '#1d4ed8' : '#334155',
                      fontWeight: isActive ? 800 : 600,
                      fontSize: '0.85rem',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      opacity: isGenerating ? 0.65 : 1,
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                    }}
                  >
                    {count} xe
                  </button>
                )
              })}

              {/* Custom Number Input */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: isCustomCount ? '#eff6ff' : '#ffffff',
                  border: isCustomCount ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '0.3rem 0.65rem',
                  flex: '1 1 130px',
                  transition: 'all 0.15s ease',
                  boxShadow: isCustomCount ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: isCustomCount ? '#1d4ed8' : '#64748b',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Tùy chỉnh:
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={isCustomCount ? customInputValue : ''}
                  placeholder={String(vehicleCount || 5)}
                  disabled={isGenerating}
                  onChange={(e) => {
                    setIsCustomCount(true)
                    setCustomInputValue(e.target.value)
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val) && val >= 1) {
                      setVehicleCount(Math.min(100, Math.max(1, val)))
                    }
                  }}
                  onFocus={() => {
                    setIsCustomCount(true)
                    if (!customInputValue) {
                      setCustomInputValue(String(vehicleCount || 5))
                    }
                  }}
                  onBlur={() => {
                    const val = parseInt(customInputValue, 10)
                    if (isNaN(val) || val < 1) {
                      setVehicleCount(5)
                      setCustomInputValue('5')
                    } else {
                      const clamped = Math.min(100, Math.max(1, val))
                      setVehicleCount(clamped)
                      setCustomInputValue(String(clamped))
                    }
                  }}
                  style={{
                    width: '60px',
                    border: 'none',
                    background: 'transparent',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    color: '#0f172a',
                    outline: 'none',
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>xe</span>
              </div>
            </div>
          </div>

          {/* Error Message if any */}
          {errorMsg && (
            <div
              style={{
                padding: '0.65rem 0.9rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#b91c1c',
                fontSize: '0.78rem',
                fontWeight: 600,
                marginBottom: '1rem',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Section 3: Genuine pNEUMA Guarantee & Trajectory Summary */}
          <div
            style={{
              padding: '0.85rem 1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '0.78rem',
              color: '#334155',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '0.35rem',
              }}
            >
              <Info size={15} color="#2563eb" />
              <span>Dataset Integrity Guarantee & Output Structure:</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: '1.45' }}>
              <li>
                <strong>Columns:</strong> Standard 10 columns (<code>track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time</code>).
              </li>
              <li>
                <strong>Kinematics:</strong> Genuine 25Hz Athens UAV coordinates (EPFL Drone Swarm), ~{approxPoints.toLocaleString()} trajectory points.
              </li>
              <li>
                <strong>Filter Scope:</strong> Strictly limited to {selectedTypes.length} vehicle type{selectedTypes.length !== 1 ? 's' : ''} ({selectedTypes.join(', ') || 'None'}).
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.5rem',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <button
            type="button"
            className="btn"
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#475569',
              fontWeight: 600,
              fontSize: '0.84rem',
            }}
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button
              type="button"
              className="btn btn--primary"
              style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                padding: '0.6rem 1.25rem',
                opacity: selectedTypes.length === 0 || isGenerating ? 0.6 : 1,
              }}
              onClick={handleGenerateCustom}
              disabled={selectedTypes.length === 0 || isGenerating}
            >
              <Database size={15} />
              <span>{isGenerating ? 'Packaging CSV...' : `Generate Dataset (${vehicleCount} Vehicles)`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
