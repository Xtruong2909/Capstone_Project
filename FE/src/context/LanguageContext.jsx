import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { translateText } from '../services/languageService'

const LANGUAGE_STORAGE_KEY = 'urban-traffic-language'
const LanguageContext = createContext(null)

function getInitialLanguage() {
  try {
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return savedLanguage === 'en' || savedLanguage === 'vi' ? savedLanguage : 'vi'
  } catch {
    return 'vi'
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage)

  const setLanguage = useCallback((nextLanguage) => {
    if (nextLanguage !== 'en' && nextLanguage !== 'vi') {
      return
    }

    setLanguageState(nextLanguage)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage)
    } catch {
      // The selected language still applies for this session if storage is unavailable.
    }
  }, [])

  const t = useCallback((text) => translateText(text, language), [language])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = translateText(
      'UAV Traffic Flow Prediction | Urban Traffic Analysis & Short-Term Forecasting',
      language
    )
    const description = document.querySelector('meta[name="description"]')
    if (description) {
      description.setAttribute(
        'content',
        translateText(
          'UAV-Based Urban Traffic Analysis and Short-Term Traffic Flow Prediction using drone trajectories, Random Forest, and LSTM.',
          language
        )
      )
    }

    const translateNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const currentText = node.nodeValue
        const leadingWhitespace = currentText.match(/^\s*/)?.[0] ?? ''
        const trailingWhitespace = currentText.match(/\s*$/)?.[0] ?? ''
        const content = currentText.slice(
          leadingWhitespace.length,
          currentText.length - trailingWhitespace.length
        )
        if (content) {
          const translated = translateText(content, language)
          if (translated !== content) {
            node.nodeValue = `${leadingWhitespace}${translated}${trailingWhitespace}`
          }
        }
        return
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return

      for (const attribute of ['aria-label', 'placeholder', 'title', 'alt']) {
        if (node.hasAttribute(attribute)) {
          const value = node.getAttribute(attribute)
          const translated = translateText(value, language)
          if (translated !== value) node.setAttribute(attribute, translated)
        }
      }

      node.childNodes.forEach(translateNode)
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          translateNode(mutation.target)
        } else if (mutation.type === 'attributes') {
          if (mutation.target.hasAttribute(mutation.attributeName)) {
            const value = mutation.target.getAttribute(mutation.attributeName)
            const translated = translateText(value, language)
            if (translated !== value) mutation.target.setAttribute(mutation.attributeName, translated)
          }
        } else {
          mutation.addedNodes.forEach(translateNode)
        }
      }
    })

    translateNode(document.body)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-label', 'placeholder', 'title', 'alt'],
      characterData: true,
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [language])

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export { LanguageContext }
