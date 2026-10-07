import { useCallback, useState } from 'react'
import HomeNavbar from './components/HomeNavbar'
import HeroSection from './components/HeroSection'
import FeaturesSection from './components/FeaturesSection'
import WorkflowSection from './components/WorkflowSection'
import DatasetsSection from './components/DatasetsSection'
import { CtaSection, HomeFooter } from './components/CtaFooter'
import LoginModal from './components/LoginModal'
import './HomePage.css'

export default function HomePage() {
  const [loginOpen, setLoginOpen] = useState(false)
  const openLogin = useCallback(() => setLoginOpen(true), [])
  const closeLogin = useCallback(() => setLoginOpen(false), [])

  return (
    <>
      <HomeNavbar onSignIn={openLogin} />
      <main>
        <HeroSection onSignIn={openLogin} />
        <FeaturesSection />
        <WorkflowSection />
        <DatasetsSection />
        <CtaSection onSignIn={openLogin} />
      </main>
      <HomeFooter />
      <LoginModal isOpen={loginOpen} onClose={closeLogin} />
    </>
  )
}
