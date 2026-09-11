import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext();

const STORAGE_KEY = 'aerotraffic_language';

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      const savedLang = localStorage.getItem(STORAGE_KEY);
      if (savedLang === 'vi' || savedLang === 'en') {
        return savedLang;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'vi'; // Default to Vietnamese
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
      document.documentElement.lang = language;
    } catch {
      // Ignore
    }
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'vi' ? 'en' : 'vi'));
  };

  /**
   * Helper translation function supporting dot-notated paths, e.g. t('nav.home')
   */
  const t = (path, fallback = '') => {
    if (!path) return fallback;
    const parts = path.split('.');
    
    // Check in current language dictionary
    let current = translations[language];
    for (const part of parts) {
      if (current && current[part] !== undefined) {
        current = current[part];
      } else {
        current = undefined;
        break;
      }
    }

    if (current !== undefined && typeof current === 'string') {
      return current;
    }

    // Fallback to Vietnamese dictionary if missing in target
    let viCurrent = translations.vi;
    for (const part of parts) {
      if (viCurrent && viCurrent[part] !== undefined) {
        viCurrent = viCurrent[part];
      } else {
        viCurrent = undefined;
        break;
      }
    }

    if (viCurrent !== undefined && typeof viCurrent === 'string') {
      return viCurrent;
    }

    return fallback || path;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
