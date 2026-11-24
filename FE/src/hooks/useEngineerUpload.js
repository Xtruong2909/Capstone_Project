import { useContext } from 'react'
import { EngineerUploadContext } from '../context/EngineerUploadContext.js'

export function useEngineerUpload() {
  const context = useContext(EngineerUploadContext)
  if (!context) throw new Error('useEngineerUpload requires EngineerUploadProvider')
  return context
}
