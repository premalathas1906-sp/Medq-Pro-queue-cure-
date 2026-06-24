import { useState, useEffect } from 'react';
import { ReceptionistDashboard } from './components/ReceptionistDashboard';
import { PatientDashboard } from './components/PatientDashboard';
import { LobbyScreen } from './components/LobbyScreen';
import { WaitingRoomDisplay } from './components/WaitingRoomDisplay';
import { DoctorDashboard } from './components/DoctorDashboard';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AIChatbot } from './components/AIChatbot';
import { useAuthStore } from './store/authStore';
import { useLanguageStore, useTranslation } from './utils/i18n';
import { Heart, Shield, Laptop, Monitor, ArrowRight, Activity, LogOut, ShieldAlert, Key } from 'lucide-react';

type ViewMode = 'home' | 'receptionist' | 'patient' | 'lobby' | 'doctor' | 'analytics' | 'admin' | 'login' | 'register' | 'waiting-room';

function App() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();
  const authStore = useAuthStore();
  const [view, setView] = useState<ViewMode>('home');

  // Change Password states
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError('');
    setChangeSuccess('');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setChangeError('All fields are required.');
      return;
    }

    if (newPassword.length < 8) {
      setChangeError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setChangeError('New passwords do not match.');
      return;
    }

    setChanging(true);
    const res = await authStore.changePassword(currentPassword, newPassword);
    setChanging(false);

    if (res.success) {
      setChangeSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setChangeSuccess('');
      }, 2000);
    } else {
      setChangeError(res.error || 'Failed to change password.');
    }
  };

  // Load user session on boot
  useEffect(() => {
    authStore.checkSession();
  }, []);

  // Sync session loading state with view
  useEffect(() => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const tokenParam = params.get('token');

    if (pathname === '/waiting-room' || viewParam === 'waiting-room') {
      setView('waiting-room');
    } else if (viewParam === 'receptionist') {
      setView('receptionist');
    } else if (viewParam === 'patient' || tokenParam) {
      setView('patient');
    } else if (viewParam === 'lobby') {
      setView('lobby');
    } else if (viewParam === 'doctor') {
      setView('doctor');
    } else if (viewParam === 'analytics') {
      setView('analytics');
    } else if (viewParam === 'admin') {
      setView('admin');
    } else if (viewParam === 'login') {
      setView('login');
    } else if (viewParam === 'register') {
      setView('register');
    } else {
      setView('home');
    }
  }, []);

  // Watch authentication and redirect accordingly
  useEffect(() => {
    if (authStore.isAuthenticated && (view === 'login' || view === 'register')) {
      // If user successfully logs in/registers, redirect to their role dashboard
      if (authStore.user?.role === 'Admin') {
        navigateTo('admin');
      } else if (authStore.user?.role === 'Doctor') {
        navigateTo('doctor');
      } else if (authStore.user?.role === 'Receptionist') {
        navigateTo('receptionist');
      } else {
        navigateTo('patient');
      }
    }
  }, [authStore.isAuthenticated, view]);

  const navigateTo = (newView: ViewMode) => {
    setView(newView);
    const params = new URLSearchParams(window.location.search);
    
    let path = window.location.pathname;
    if (newView === 'waiting-room') {
      path = '/waiting-room';
      params.delete('view');
    } else {
      if (path === '/waiting-room') {
        path = '/';
      }
      if (newView === 'home') {
        params.delete('view');
      } else {
        params.set('view', newView);
      }
    }
    
    // Maintain token param if navigating to patient
    if (newView !== 'patient') {
      params.delete('token');
    }

    const newStr = params.toString() ? `?${params.toString()}` : '';
    const newurl = window.location.protocol + "//" + window.location.host + path + newStr;
    window.history.pushState({ path: newurl }, '', newurl);
  };

  const handleLogout = async () => {
    await authStore.logout();
    navigateTo('home');
  };

  // Helper guard renderers to enforce RBAC
  const renderProtectedRoute = (allowedRoles: string[], component: React.ReactNode) => {
    if (authStore.loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <span className="h-6 w-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-2" />
          Verifying security authorization...
        </div>
      );
    }

    if (!authStore.isAuthenticated) {
      return <Login onNavigate={navigateTo} />;
    }

    if (!allowedRoles.includes(authStore.user?.role || '')) {
      return (
        <div className="max-w-md mx-auto py-16 text-center space-y-4">
          <div className="h-14 w-14 bg-rose-950/40 text-rose-400 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Security Access Denied</h2>
          <p className="text-sm text-slate-400">
            Your authenticated account ({authStore.user?.role}) does not have permission to view this dashboard panel.
          </p>
          <button
            onClick={() => navigateTo('home')}
            className="px-5 py-2 bg-slate-800 border border-slate-700 hover:text-white rounded-xl text-xs font-semibold"
          >
            Return to Portal Home
          </button>
        </div>
      );
    }

    return component;
  };

  const isTvMode = view === 'waiting-room' || view === 'lobby';

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col font-sans select-none selection:bg-cyan-500/30">
      
      {/* Top Navbar */}
      {!isTvMode && (
        <header className="border-b border-white/5 bg-[#0b0f19]/70 backdrop-blur-md sticky top-0 z-50 transition duration-150">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div 
            onClick={() => navigateTo('home')} 
            className="flex items-center gap-2 cursor-pointer group"
          >
            <Activity className="h-6 w-6 text-cyan-400 group-hover:rotate-12 transition duration-200" />
            <span className="font-black text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent">
              MED<span className="text-cyan-400">Q</span> PRO
            </span>
          </div>

          <nav className="flex items-center gap-2 text-xs md:text-sm font-semibold overflow-x-auto max-w-[calc(100vw-120px)] whitespace-nowrap scrollbar-none">
            <button
              onClick={() => navigateTo('home')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                view === 'home' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('portal_home')}
            </button>
            <button
              onClick={() => navigateTo('receptionist')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                view === 'receptionist' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('receptionist')}
            </button>
            <button
              onClick={() => navigateTo('doctor')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                view === 'doctor' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('doctor_desk')}
            </button>
            <button
              onClick={() => navigateTo('patient')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                view === 'patient' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('patient_app')}
            </button>
            <button
              onClick={() => navigateTo('lobby')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                (view as string) === 'lobby' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('lobby_tv')}
            </button>
            <button
              onClick={() => navigateTo('waiting-room')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                (view as string) === 'waiting-room' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Waiting Room
            </button>
            <button
              onClick={() => navigateTo('analytics')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                view === 'analytics' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('analytics')}
            </button>
            
            {authStore.user?.role === 'Admin' && (
              <button
                onClick={() => navigateTo('admin')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  view === 'admin' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Admin
              </button>
            )}

            {/* Language Selector */}
            <div className="ml-2 border-l border-white/10 pl-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 text-xs font-bold text-white rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value="en">EN</option>
                <option value="hi">हिन्दी</option>
                <option value="ta">தமிழ்</option>
                <option value="te">తెలుగు</option>
              </select>
            </div>

            {/* Profile Dropdown & Sign In / Out */}
            {authStore.isAuthenticated ? (
              <div className="flex items-center gap-2 border-l border-white/10 pl-2 ml-1">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-[11px] font-bold text-white leading-tight">{authStore.user?.name}</span>
                  <span className="text-[9px] font-semibold text-slate-500 uppercase leading-none">{authStore.user?.role}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg transition"
                  title={t('logout')}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigateTo('login')}
                className="ml-2 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-black transition"
              >
                {t('login')}
              </button>
            )}
          </nav>
        </div>
        </header>
      )}

      {/* Default Password Security Warning Bar */}
      {!isTvMode && authStore.isAuthenticated && authStore.user?.isDefaultPassword && (
        <div className="bg-amber-950/40 border-b border-amber-500/20 text-amber-300 px-4 py-3 text-xs md:text-sm font-semibold flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-2 max-w-xl">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>Security Alert:</strong> You are currently using a default/seeded password. For security, please change your password immediately.
            </span>
          </div>
          <button
            onClick={() => setShowChangePasswordModal(true)}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition whitespace-nowrap"
          >
            Change Password
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className={isTvMode ? "flex-1 flex flex-col h-screen" : "flex-1"}>
        {view === 'home' && (
          <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-16">
            
            {/* Hero Title */}
            <div className="space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-950/40 text-cyan-400 border border-cyan-500/20 uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse glow-cyan" />
                Live Digital Queue platform
              </span>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-tight">
                Healthcare Queue Management,<br />
                <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                  Reimagined in Real-Time.
                </span>
              </h1>
              <p className="text-base md:text-lg text-slate-400 max-w-xl mx-auto mt-4 font-medium leading-relaxed">
                Replace paper token slips, chaotic waiting rooms, and shouting with a connected, real-time clinical dashboard.
              </p>
            </div>

            {/* Launchpad Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1: Receptionist Desk */}
              <div 
                onClick={() => navigateTo('receptionist')}
                className="glass-card rounded-2xl p-6 text-left cursor-pointer group hover:border-cyan-500/30 hover:bg-slate-900/60 transition duration-300 relative overflow-hidden"
              >
                <div className="h-12 w-12 bg-cyan-500/10 text-cyan-400 rounded-xl flex items-center justify-center border border-cyan-500/10 mb-5 group-hover:scale-110 transition duration-300">
                  <Laptop className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition">Receptionist Desk</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  Register patients in under 10 seconds, auto-assign queue tokens, call next patient, and configure parameters.
                </p>
                <div className="flex items-center gap-1 text-xs text-cyan-400 font-semibold mt-4">
                  Launch Desk <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition duration-200" />
                </div>
              </div>

              {/* Card 2: Patient Mobile App */}
              <div 
                onClick={() => navigateTo('patient')}
                className="glass-card rounded-2xl p-6 text-left cursor-pointer group hover:border-cyan-500/30 hover:bg-slate-900/60 transition duration-300 relative overflow-hidden"
              >
                <div className="h-12 w-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/10 mb-5 group-hover:scale-110 transition duration-300">
                  <Heart className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition">Patient Mobile Tracker</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  Track queue position, check wait times, receive turn alerts via browser notifications, and browse health tips.
                </p>
                <div className="flex items-center gap-1 text-xs text-cyan-400 font-semibold mt-4">
                  Launch App <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition duration-200" />
                </div>
              </div>

              {/* Card 3: Lobby Monitor */}
              <div 
                onClick={() => navigateTo('lobby')}
                className="glass-card rounded-2xl p-6 text-left cursor-pointer group hover:border-cyan-500/30 hover:bg-slate-900/60 transition duration-300 relative overflow-hidden"
              >
                <div className="h-12 w-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/10 mb-5 group-hover:scale-110 transition duration-300">
                  <Monitor className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition">Lobby TV Screen</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  Public monitor showing current token called in massive text, upcoming queue, and plays voice-synthesized audio calls.
                </p>
                <div className="flex items-center gap-1 text-xs text-cyan-400 font-semibold mt-4">
                  Launch Monitor <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition duration-200" />
                </div>
              </div>

            </div>

            {/* Quick Multi-window Demo instructions */}
            <div className="p-5 bg-slate-900/40 border border-white/5 rounded-2xl text-left max-w-xl mx-auto space-y-2">
              <span className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider">
                <Shield className="h-4 w-4" />
                Real-Time Demonstration Guide
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                To experience the instant sync: open one window for the <strong>Receptionist Desk</strong>, and another window (or mobile phone/incognito window) for the <strong>Lobby Monitor</strong> or <strong>Patient App</strong>. When you register a patient or click "Call Next", all screens update instantly!
              </p>
            </div>

          </div>
        )}

        {view === 'login' && <Login onNavigate={navigateTo} />}
        {view === 'register' && <Register onNavigate={navigateTo} />}
        
        {view === 'receptionist' && renderProtectedRoute(['Receptionist', 'Admin'], <ReceptionistDashboard />)}
        {view === 'doctor' && renderProtectedRoute(['Doctor', 'Admin'], <DoctorDashboard />)}
        {view === 'admin' && renderProtectedRoute(['Admin'], <AdminDashboard />)}
        {view === 'analytics' && renderProtectedRoute(['Admin', 'Doctor', 'Receptionist'], <AnalyticsDashboard />)}
        
        {view === 'patient' && <PatientDashboard />}
        {view === 'lobby' && <LobbyScreen onBack={() => navigateTo('home')} />}
        {view === 'waiting-room' && <WaitingRoomDisplay onBack={() => navigateTo('home')} />}
      </main>

      {/* Floating assistant widget */}
      {!isTvMode && <AIChatbot />}

      {/* Footer */}
      {!isTvMode && (
        <footer className="border-t border-white/5 py-6 bg-[#070a13] text-center text-xs text-slate-500">
          <p>© 2026 MedQ Systems. All rights reserved.</p>
        </footer>
      )}

      {/* Change Password Modal Overlay */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative">
            <button
              onClick={() => {
                setShowChangePasswordModal(false);
                setChangeError('');
                setChangeSuccess('');
              }}
              className="absolute top-4 right-4 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 bg-cyan-500/10 text-cyan-400 rounded-lg flex items-center justify-center border border-cyan-500/20">
                <Key className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-white">Change Default Password</h3>
            </div>

            {changeError && (
              <div className="p-3 bg-rose-950/30 border border-rose-500/20 rounded-xl text-rose-300 text-xs font-semibold">
                {changeError}
              </div>
            )}

            {changeSuccess && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs font-semibold">
                {changeSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="e.g. Doctor@123"
                  className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-650 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  New Password (Min. 8 chars)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter secure password"
                  className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-655 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm secure password"
                  className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-655 focus:outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={changing}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition duration-200 glow-cyan active:scale-[0.99] flex justify-center items-center gap-1.5"
              >
                {changing ? 'Updating Password...' : 'Save Password'}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
