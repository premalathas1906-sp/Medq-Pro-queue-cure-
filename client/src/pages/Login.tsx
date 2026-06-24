import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { LogIn, Key, Mail, ShieldAlert, Bot } from 'lucide-react';
import { useTranslation } from '../utils/i18n';

declare global {
  interface Window {
    google?: any;
  }
}

export const Login: React.FC<{ onNavigate?: (view: any) => void }> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const loginStore = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [googleError, setGoogleError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!email || !password) {
      setFormError('Please enter both email and password.');
      return;
    }

    const success = await loginStore.login(email, password);
    if (!success) {
      // Error message is stored in Zustand store
      setFormError(loginStore.error || 'Authentication failed.');
    }
  };

  const handleGoogleCallback = async (response: any) => {
    setGoogleError('');
    setFormError('');
    if (!response.credential) {
      setGoogleError('Failed to retrieve Google credentials.');
      return;
    }
    const success = await loginStore.loginWithGoogle(response.credential);
    if (!success) {
      setGoogleError(loginStore.error || 'Google authentication failed.');
    }
  };

  const handleMockGoogleLogin = async (mockEmail: string) => {
    setGoogleError('');
    setFormError('');
    const mockCredential = `mock_google_token_${mockEmail}`;
    const success = await loginStore.loginWithGoogle(mockCredential);
    if (!success) {
      setGoogleError(loginStore.error || 'Mock Google authentication failed.');
    }
  };

  useEffect(() => {
    const initializeGoogleSignIn = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '109283748291-mockclientid.apps.googleusercontent.com',
          callback: handleGoogleCallback,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-button'),
          {
            theme: 'dark',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
          }
        );
      }
    };

    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        initializeGoogleSignIn();
        clearInterval(timer);
      }
    }, 100);

    return () => clearInterval(timer);
  }, []);

  // Quick Login Injector (extremely helpful for demo validation!)
  const injectCredentials = (role: 'admin' | 'doctor' | 'receptionist' | 'patient') => {
    setFormError('');
    if (role === 'admin') {
      setEmail('admin@medq.com');
      setPassword('Admin@123');
    } else if (role === 'doctor') {
      setEmail('doctor1@medq.com');
      setPassword('Doctor@123');
    } else if (role === 'receptionist') {
      setEmail('receptionist@medq.com');
      setPassword('Receptionist@123');
    } else if (role === 'patient') {
      setEmail('patient@medq.com');
      setPassword('Patient@123');
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="glass-card rounded-3xl p-8 shadow-2xl relative overflow-hidden border border-white/10">
        
        {/* Glow */}
        <div className="absolute top-0 right-0 h-[120px] w-[120px] bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="text-center mb-8">
          <div className="h-12 w-12 bg-cyan-500/10 text-cyan-400 rounded-2xl flex items-center justify-center border border-cyan-500/20 mx-auto mb-4">
            <Key className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">{t('login')}</h2>
          <p className="text-xs text-slate-400 mt-1">Access your MedQ Pro Dashboard</p>
        </div>

        {(formError || googleError) && (
          <div className="p-3.5 bg-rose-950/30 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-semibold flex items-center gap-2 mb-6">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{formError || googleError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor1@medq.com"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
              />
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
              />
              <Key className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginStore.loading}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-6 rounded-xl transition duration-200 glow-cyan active:scale-[0.99] flex items-center justify-center gap-2 mt-6"
          >
            <LogIn className="h-4 w-4" />
            {loginStore.loading ? 'Authenticating...' : t('login')}
          </button>
        </form>

        <div className="relative my-6 flex items-center justify-center">
          <div className="border-t border-white/10 w-full"></div>
          <span className="absolute bg-[#111827] px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            or
          </span>
        </div>

        {/* Google Identity Services Sign-In Button */}
        <div className="w-full flex flex-col items-center">
          <div id="google-signin-button" className="w-full min-h-[44px] flex justify-center bg-slate-950 rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition"></div>
        </div>

        {/* Redirect to Register */}
        {onNavigate && (
          <div className="mt-4 text-center">
            <span className="text-xs text-slate-400">
              New patient?{' '}
              <button
                onClick={() => onNavigate('register')}
                className="text-cyan-400 hover:text-cyan-300 font-bold underline transition focus:outline-none"
              >
                Create your account here
              </button>
            </span>
          </div>
        )}

        {/* Quick Injector Panel */}
        <div className="mt-8 border-t border-white/5 pt-6">
          <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block mb-3 flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-cyan-500" />
            Quick Demo Accounts (1-Click)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => injectCredentials('receptionist')}
              className="py-2 px-3 bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-cyan-500/20 text-[11px] font-semibold text-slate-300 rounded-xl text-left transition"
            >
              📋 Receptionist
            </button>
            <button
              onClick={() => injectCredentials('doctor')}
              className="py-2 px-3 bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-cyan-500/20 text-[11px] font-semibold text-slate-300 rounded-xl text-left transition"
            >
              🩺 Doctor
            </button>
            <button
              onClick={() => injectCredentials('admin')}
              className="py-2 px-3 bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-cyan-500/20 text-[11px] font-semibold text-slate-300 rounded-xl text-left transition"
            >
              🛡️ Admin
            </button>
            <button
              onClick={() => injectCredentials('patient')}
              className="py-2 px-3 bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-cyan-500/20 text-[11px] font-semibold text-slate-300 rounded-xl text-left transition"
            >
              👤 Patient
            </button>

            <div className="col-span-2 mt-2 pt-2 border-t border-white/5">
              <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wider block mb-1.5">
                Google OAuth Simulated Login
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleMockGoogleLogin('google.patient@medq.com')}
                  className="py-1.5 px-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/10 hover:border-rose-500/30 text-[10px] font-semibold text-rose-300 rounded-xl transition text-left"
                >
                  🌐 New Google (Patient)
                </button>
                <button
                  onClick={() => handleMockGoogleLogin('doctor1@medq.com')}
                  className="py-1.5 px-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/10 hover:border-rose-500/30 text-[10px] font-semibold text-rose-300 rounded-xl transition text-left"
                >
                  🌐 Exist Google (Doctor)
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
