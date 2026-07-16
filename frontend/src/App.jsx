import { Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './i18n/LanguageContext'
import ChatbotPage from './pages/ChatbotPage'
import NotFoundPage from './pages/NotFoundPage'
import CardPage from './pages/CardPage'
import VerifyPage from './pages/VerifyPage'
import ReferralPage from './pages/ReferralPage'
import MyMembersPage from './pages/MyMembersPage'
import BestPerformersPage from './pages/BestPerformersPage'
import AdminLayout from './pages/admin/AdminLayout'
import LoginPage from './pages/admin/LoginPage'
import DashboardPage from './pages/admin/DashboardPage'
import VotersPage from './pages/admin/VotersPage'
import VoterDetailPage from './pages/admin/VoterDetailPage'
import GeneratedVotersPage from './pages/admin/GeneratedVotersPage'
import GeneratedVoterDetailPage from './pages/admin/GeneratedVoterDetailPage'
import VolunteerRequestsPage from './pages/admin/VolunteerRequestsPage'
import ConfirmedVolunteersPage from './pages/admin/ConfirmedVolunteersPage'
import BoothAgentRequestsPage from './pages/admin/BoothAgentRequestsPage'
import ConfirmedBoothAgentsPage from './pages/admin/ConfirmedBoothAgentsPage'
import ReportsPage from './pages/admin/ReportsPage'
import LocalBodyPage from './pages/admin/LocalBodyPage'
import MeetRequestsPage from './pages/admin/MeetRequestsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LanguageProvider><ChatbotPage /></LanguageProvider>} />
      <Route path="/card/:epicNo" element={<CardPage />} />
      <Route path="/verify/:epicNo" element={<VerifyPage />} />
      <Route path="/refer/:bjpCode/:referralId" element={<ReferralPage />} />
      <Route path="/my-members/:bjpCode" element={<MyMembersPage />} />
      <Route path="/best-performers" element={<BestPerformersPage />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="voters" element={<VotersPage />} />
        <Route path="voters/:epicNo" element={<VoterDetailPage />} />
        <Route path="generated-voters" element={<GeneratedVotersPage />} />
        <Route path="generated-voters/:bjpCode" element={<GeneratedVoterDetailPage />} />
        <Route path="volunteer-requests" element={<VolunteerRequestsPage />} />
        <Route path="confirmed-volunteers" element={<ConfirmedVolunteersPage />} />
        <Route path="booth-agent-requests" element={<BoothAgentRequestsPage />} />
        <Route path="confirmed-booth-agents" element={<ConfirmedBoothAgentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="local-body" element={<LocalBodyPage />} />
        <Route path="meet-requests" element={<MeetRequestsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
