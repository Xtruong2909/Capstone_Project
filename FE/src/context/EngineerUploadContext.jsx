import { useAuth } from '../hooks/useAuth'
import { useEngineerUploadState } from '../hooks/useEngineerUploadState'
import { EngineerUploadContext } from './EngineerUploadContext.js'

function UploadSession({ children }) {
  const upload = useEngineerUploadState()
  return <EngineerUploadContext.Provider value={upload}>{children}</EngineerUploadContext.Provider>
}

export function EngineerUploadProvider({ children }) {
  const { user } = useAuth()
  // A different account must never inherit the previous account's files or results.
  return <UploadSession key={user?.id || 'anonymous'}>{children}</UploadSession>
}
