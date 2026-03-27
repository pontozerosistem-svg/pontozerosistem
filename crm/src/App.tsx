import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import AuthGuard from './components/AuthGuard'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/crm" replace />} />
      <Route 
        path="/crm" 
        element={
          <AuthGuard>
            <Dashboard />
          </AuthGuard>
        } 
      />
    </Routes>
  )
}
