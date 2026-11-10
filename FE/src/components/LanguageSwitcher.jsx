import { Globe } from 'lucide-react'
import { useLanguage } from '../hooks/useLanguage'

export default function LanguageSwitcher({ className = '' }) {
  const { language, setLanguage, t } = useLanguage()
  const nextLanguage = language === 'vi' ? 'en' : 'vi'
  const nextLanguageLabel = nextLanguage === 'en' ? 'English' : 'Tiếng Việt'

  return (
    <button
      type="button"
      className={`language-switch ${className}`.trim()}
      onClick={() => setLanguage(nextLanguage)}
      aria-label={t(`Switch language to ${nextLanguageLabel}`)}
      title={t(`Switch language to ${nextLanguageLabel}`)}
    >
      <Globe size={18} strokeWidth={2} aria-hidden="true" />
      <span>{language === 'vi' ? 'VI' : 'EN'}</span>
    </button>
  )
}
