import { useEffect, useMemo, useRef, useState } from 'react'
import { engineerService } from '../services/engineerService'
import { useEngineerJob, useEngineerMutation } from './useEngineerData'
import { useLanguage } from './useLanguage'
import { MAX_UPLOAD_SIZE_BYTES } from '../features/engineer/utils/engineerHelpers'

const FILENAME_REGEX = /^\d{8}_d\d+_\d{4}_\d{4}\.csv$/i

export function useEngineerUploadState() {
  const { t } = useLanguage()
  const [files, setFiles] = useState([])
  const [metadata, setMetadata] = useState({ group_name: '', source: '', location_name: '', description: '' })
  const [progress, setProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState('preparing')
  const [result, setResult] = useState(null)
  const [validationError, setValidationError] = useState('')
  const mutation = useEngineerMutation()
  const job = useEngineerJob('upload', true)
  const pending = useRef(false)
  const mounted = useRef(true)
  const busy = mutation.busy || job.running

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // File objects and in-flight requests belong to the workspace, not its upload route.
  // A page reload cannot preserve browser File objects; warn while bytes are in flight.
  useEffect(() => {
    if (!mutation.busy) return
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [mutation.busy])

  const analyzedFiles = useMemo(() => files.map((file) => {
    const error = !FILENAME_REGEX.test(file.name)
      ? t('File name must match YYYYMMDD_dX_HHMM_HHMM.csv')
      : file.size === 0 ? t('File is empty (0 bytes)')
        : file.size > MAX_UPLOAD_SIZE_BYTES ? t('File exceeds maximum upload size (2.5 GB)') : null
    return { file, name: file.name, size: file.size, isValid: !error, error }
  }), [files, t])
  const invalidFilesCount = analyzedFiles.filter((item) => !item.isValid).length
  const totalValidBytes = analyzedFiles.filter((item) => item.isValid).reduce((sum, item) => sum + item.size, 0)
  const locked = () => busy || pending.current
  const handleSelectFiles = (selected) => {
    if (locked()) return
    const incoming = Array.from(selected || [])
    if (!incoming.length) return
    const names = new Set(files.map((file) => file.name))
    const fresh = incoming.filter((file) => {
      if (names.has(file.name)) return false
      names.add(file.name)
      return true
    })
    setFiles((previous) => [...previous, ...fresh])
    setValidationError('')
    mutation.clear()
    setResult(null)
    job.track(null)
  }
  const handleRemoveFile = (index) => {
    if (locked()) return
    setFiles((previous) => previous.filter((_, position) => position !== index))
    setValidationError('')
  }
  const handleRemoveAllInvalid = () => {
    if (locked()) return
    setFiles((previous) => previous.filter((file) => FILENAME_REGEX.test(file.name)
      && file.size > 0 && file.size <= MAX_UPLOAD_SIZE_BYTES))
    setValidationError('')
  }
  const handleClearAllFiles = () => {
    if (locked()) return
    setFiles([])
    setValidationError('')
  }
  const reset = () => {
    if (locked()) return
    setFiles([])
    setResult(null)
    setValidationError('')
    setProgress(0)
    mutation.clear()
    job.track(null)
  }
  const handleUploadSubmit = async (event) => {
    event.preventDefault()
    if (locked()) return
    if (!files.length) {
      setValidationError(t('Select at least one CSV recording session to upload.'))
      return
    }
    if (invalidFilesCount) {
      setValidationError(t('Please remove or fix all invalid files before uploading.'))
      return
    }
    pending.current = true
    setValidationError('')
    setResult(null)
    setProgress(0)
    setUploadPhase('preparing')
    job.track(null)
    try {
      await mutation.run(async () => {
        const response = await engineerService.upload({ files, ...metadata }, (event) => {
          if (!mounted.current) return
          setUploadPhase(event.phase || 'local')
          if (event.total) setProgress(Math.round((event.loaded * 100) / event.total))
        })
        if (!mounted.current) return
        if (response?.job_id) job.track(response)
        else setResult(response)
        setFiles([])
      }, undefined, '')
    } finally { pending.current = false }
  }
  return { files, metadata, setMetadata, progress, uploadPhase, validationError,
    mutation, job, busy, finalResult: result || job.data?.result,
    analyzedFiles, invalidFilesCount, totalValidBytes, handleSelectFiles, handleRemoveFile,
    handleRemoveAllInvalid, handleClearAllFiles, handleUploadSubmit, reset }
}

