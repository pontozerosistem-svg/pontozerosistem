import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import AuthGuard from './components/AuthGuard'
import WhatsAppSetup from './pages/WhatsAppSetup'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
          <AuthGuard>
            <Dashboard />
          </AuthGuard>
      } />
      <Route path="/whatsapp" element={
          <AuthGuard>
            <WhatsAppSetup />
          </AuthGuard>
      } />
    </Routes>
  )
}
