import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { User, Mail, Phone, Lock, Calendar, ShieldAlert, Sparkles, ArrowLeft } from 'lucide-react';

export const Register: React.FC<{ onNavigate?: (view: any) => void }> = ({ onNavigate }) => {
  const authStore = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Other');
  
  // Role & role-specific states
  const [role, setRole] = useState<'Patient' | 'Doctor' | 'Receptionist'>('Patient');
  const [specialization, setSpecialization] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [shiftHours, setShiftHours] = useState('08:00 - 16:00');

  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!name || !email || !phone || !password || !confirmPassword) {
      setFormError('Please fill out all required fields.');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setFormError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (role === 'Patient') {
      const success = await authStore.registerPatient({
        name,
        email,
        phone,
        password,
        dob,
        gender
      });

      if (!success) {
        setFormError(authStore.error || 'Registration failed. Please try again.');
      }
    } else if (role === 'Doctor') {
      if (!specialization || !roomNumber) {
        setFormError('Please enter both specialization and room number.');
        return;
      }

      const success = await authStore.registerUser({
        name,
        email,
        phone,
        password,
        role: 'Doctor',
        details: {
          specialization,
          room_number: roomNumber
        }
      });

      if (success) {
        setSuccessMsg('Doctor account created successfully! Redirecting to login...');
        setTimeout(() => {
          onNavigate && onNavigate('login');
        }, 2000);
      } else {
        setFormError(authStore.error || 'Registration failed. Please try again.');
      }
    } else if (role === 'Receptionist') {
      const success = await authStore.registerUser({
        name,
        email,
        phone,
        password,
        role: 'Receptionist',
        details: {
          shift_hours: shiftHours
        }
      });

      if (success) {
        setSuccessMsg('Receptionist account created successfully! Redirecting to login...');
        setTimeout(() => {
          onNavigate && onNavigate('login');
        }, 2000);
      } else {
        setFormError(authStore.error || 'Registration failed. Please try again.');
      }
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="glass-card rounded-3xl p-8 shadow-2xl relative overflow-hidden border border-white/10">
        
        {/* Glow */}
        <div className="absolute top-0 right-0 h-[120px] w-[120px] bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
        
        {/* Back Button */}
        {onNavigate && (
          <button
            onClick={() => onNavigate('login')}
            className="absolute top-6 left-6 text-slate-400 hover:text-white transition duration-200 flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        )}

        <div className="text-center mb-6 mt-4">
          <div className="h-12 w-12 bg-cyan-500/10 text-cyan-400 rounded-2xl flex items-center justify-center border border-cyan-500/20 mx-auto mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Create Account</h2>
          <p className="text-xs text-slate-400 mt-1">Register to join the clinic portal</p>
        </div>

        {successMsg && (
          <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-semibold flex items-center gap-2 mb-6">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{successMsg}</span>
          </div>
        )}

        {(formError || authStore.error) && !successMsg && (
          <div className="p-3.5 bg-rose-950/30 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-semibold flex items-center gap-2 mb-6">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{formError || authStore.error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Account Role Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              I want to register as a:
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition font-bold font-sans"
            >
              <option value="Patient">Patient</option>
              <option value="Doctor">Doctor (Staff)</option>
              <option value="Receptionist">Receptionist (Staff)</option>
            </select>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Full Name *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
              />
              <User className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Email Address *
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john.doe@example.com"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
              />
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          {/* Mobile Number */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Mobile Number *
            </label>
            <div className="relative">
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
              />
              <Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          {/* Role-specific Fields */}
          {role === 'Patient' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Date of Birth
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                  />
                  <Calendar className="absolute left-2.5 top-3 h-3.5 w-3.5 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          )}

          {role === 'Doctor' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Specialization *
                </label>
                <input
                  type="text"
                  required
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g. Cardiology"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Room Number *
                </label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. Room 1"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition font-bold"
                />
              </div>
            </div>
          )}

          {role === 'Receptionist' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Shift Hours *
              </label>
              <input
                type="text"
                required
                value={shiftHours}
                onChange={(e) => setShiftHours(e.target.value)}
                placeholder="e.g. 08:00 - 16:00"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition font-bold"
              />
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Password * (Min. 8 chars)
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
              />
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Confirm Password *
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
              />
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <button
            type="submit"
            disabled={authStore.loading}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-6 rounded-xl transition duration-200 glow-cyan active:scale-[0.99] flex items-center justify-center gap-2 mt-6 font-sans"
          >
            <Sparkles className="h-4 w-4" />
            {authStore.loading 
              ? 'Processing...' 
              : role === 'Patient' 
                ? 'Register & Log In' 
                : 'Create Staff Account'}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-white/5 pt-4">
          <span className="text-xs text-slate-400 font-sans">
            Already have an account?{' '}
            <button
              onClick={() => onNavigate && onNavigate('login')}
              className="text-cyan-400 hover:text-cyan-300 font-bold underline transition focus:outline-none"
            >
              Sign In
            </button>
          </span>
        </div>

      </div>
    </div>
  );
};
