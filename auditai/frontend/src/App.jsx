import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Login from './pages/Login';
import ConsolidatedIS from './pages/ConsolidatedIS';
import ZohoDashboard from './pages/ZohoDashboard';
import KeyInitiatives from './pages/KeyInitiatives';
import SignupConversion from './pages/SignupConversion';
import RetentionImprovements from './pages/RetentionImprovements';
import BrokingIS from './pages/BrokingIS';
import OverallCohorts from './pages/OverallCohorts';
import SubscriptionCohorts from './pages/SubscriptionCohorts';
import AdvisoryIdeas from './pages/AdvisoryIdeas';
import BrokingCohorts from './pages/BrokingCohorts';
import OrdersMix from './pages/OrdersMix';
import RevenueMix from './pages/RevenueMix';
import CallAccuracy from './pages/CallAccuracy';
import OfferingsMatrix from './pages/OfferingsMatrix';
import FundraiseHistory from './pages/FundraiseHistory';
import ChannelCAC from './pages/ChannelCAC';
import CFOAssistant from './pages/CFOAssistant';
import CashMIS from './pages/CashMIS';

export default function App() {
  const location = useLocation();
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('mis_auth'));

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/consolidated-is" replace />} />
              <Route path="/zoho" element={<ZohoDashboard />} />
              <Route path="/consolidated-is" element={<ConsolidatedIS />} />
              <Route path="/key-initiatives" element={<KeyInitiatives />} />
              <Route path="/signup-conversion" element={<SignupConversion />} />
              <Route path="/retention" element={<RetentionImprovements />} />
              <Route path="/broking-is" element={<BrokingIS />} />
              <Route path="/overall-cohorts" element={<OverallCohorts />} />
              <Route path="/subscription-cohorts" element={<SubscriptionCohorts />} />
              <Route path="/advisory-ideas" element={<AdvisoryIdeas />} />
              <Route path="/broking-cohorts" element={<BrokingCohorts />} />
              <Route path="/orders-mix" element={<OrdersMix />} />
              <Route path="/revenue-mix" element={<RevenueMix />} />
              <Route path="/call-accuracy" element={<CallAccuracy />} />
              <Route path="/offerings-matrix" element={<OfferingsMatrix />} />
              <Route path="/fundraise" element={<FundraiseHistory />} />
              <Route path="/channel-cac" element={<ChannelCAC />} />
              <Route path="/cfo" element={<CFOAssistant />} />
              <Route path="/cash-mis" element={<CashMIS />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}
