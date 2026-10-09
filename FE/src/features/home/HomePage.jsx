import HeroSection from './components/HeroSection'
import FeaturesSection from './components/FeaturesSection'
import WorkflowSection from './components/WorkflowSection'
import DatasetsSection from './components/DatasetsSection'
import { CtaSection, HomeFooter } from './components/CtaFooter'
import BackToTop from './components/BackToTop'
import { useNavigate } from 'react-router-dom'
import './HomePage.css'

export default function HomePage() {
  const navigate = useNavigate()
  const openLogin = () => navigate('/login')

  return (
    <>
      <BackToTop />
      <main>
        <HeroSection onSignIn={openLogin} />
        <FeaturesSection />
        <WorkflowSection />
        <DatasetsSection />
        <CtaSection onSignIn={openLogin} />
      </main>
      <HomeFooter />
    </>
  )
}

