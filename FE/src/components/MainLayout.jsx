import { Outlet } from 'react-router-dom'
import HomeNavbar from '../features/home/components/HomeNavbar'

export default function MainLayout() {
  return (
    <div className="app-layout">
      <HomeNavbar />
      <Outlet />
    </div>
  )
}
