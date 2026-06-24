import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Shield, Users, Settings, ScrollText, UserMinus, UserPlus, AlertCircle, RefreshCw } from 'lucide-react';

interface User {
  id: string;
  email: string;
  role: 'Admin' | 'Doctor' | 'Receptionist' | 'Patient';
  name: string;
  phone: string;
  created_at: string;
}

interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: string;
  details: string;
  ip_address: string;
  timestamp: string;
}

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'logs'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  
  // Registration form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'Admin' | 'Doctor' | 'Receptionist' | 'Patient'>('Doctor');
  const [specialization, setSpecialization] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [consultationFee, setConsultationFee] = useState('100');
  const [avgDuration, setAvgDuration] = useState('10');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Settings state
  const [clinicName, setClinicName] = useState('MedQ Pro Healthcare Center');
  const [clinicHours, setClinicHours] = useState('8:00 AM - 8:00 PM');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data.users || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/analytics/audit-logs');
      setLogs(response.data.logs || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await api.get('/queue/settings');
      const settingsList = response.data.settings || [];
      const nameSet = settingsList.find((s: any) => s.key === 'clinicName');
      const hoursSet = settingsList.find((s: any) => s.key === 'clinicHours');
      if (nameSet) setClinicName(JSON.parse(nameSet.value));
      if (hoursSet) setClinicHours(JSON.parse(hoursSet.value));
    } catch (err) {
      console.error('Failed to load clinic settings:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab]);

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this user? All relational data will be cascadingly removed!')) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      await api.delete(`/auth/users/${id}`);
      setSuccessMsg('User account deleted successfully.');
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const details: any = {};
    if (role === 'Doctor') {
      details.specialization = specialization || 'General Medicine';
      details.room_number = roomNumber || 'Room 1';
      details.consultation_fee = parseFloat(consultationFee) || 100.0;
      details.avg_duration_minutes = parseFloat(avgDuration) || 10.0;
    }

    try {
      await api.post('/auth/register', {
        email,
        password,
        name,
        phone,
        role,
        details
      });
      setSuccessMsg(`New ${role} registered successfully!`);
      setShowAddModal(false);
      // Reset form
      setEmail('');
      setPassword('');
      setName('');
      setPhone('');
      setSpecialization('');
      setRoomNumber('');
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to register new account');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.post('/queue/settings', { key: 'clinicName', value: clinicName });
      await api.post('/queue/settings', { key: 'clinicHours', value: clinicHours });
      setSuccessMsg('Clinic settings updated successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-cyan-400" />
            Admin Settings & Control Panel
          </h1>
          <p className="text-slate-400 mt-1">Enterprise Core Administration Console</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 bg-slate-900/60 p-1.5 rounded-2xl border border-white/5 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'users' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="h-4 w-4" />
          User Profiles
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'settings' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="h-4 w-4" />
          Clinic Configuration
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'logs' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ScrollText className="h-4 w-4" />
          Security Audit Trail
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-950/30 border border-rose-500/20 rounded-2xl text-rose-300 text-sm font-semibold flex items-center gap-2 mb-6 animate-pulse">
          <AlertCircle className="h-5 w-5 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/30 border border-emerald-500/20 rounded-2xl text-emerald-300 text-sm font-semibold flex items-center gap-2 mb-6">
          <Shield className="h-5 w-5 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Content Panes */}
      <div className="glass-card rounded-3xl p-6 shadow-2xl min-h-[400px]">
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white">Registered Users</h3>
                <p className="text-xs text-slate-400 mt-0.5">Manage clinic doctors, receptionists, and patient files</p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition shadow-lg glow-cyan active:scale-[0.98]"
              >
                <UserPlus className="h-4 w-4" />
                Register Staff
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 uppercase text-xs font-extrabold tracking-wider">
                    <th className="py-4 px-3">Name</th>
                    <th className="py-4 px-3">Role</th>
                    <th className="py-4 px-3">Email</th>
                    <th className="py-4 px-3">Phone</th>
                    <th className="py-4 px-3">Created</th>
                    <th className="py-4 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                  {loading && users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-500">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Fetching database records...
                      </td>
                    </tr>
                  ) : users.length > 0 ? (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-4 px-3 text-white font-bold">{user.name}</td>
                        <td className="py-4 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            user.role === 'Admin' ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/20' :
                            user.role === 'Doctor' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' :
                            user.role === 'Receptionist' ? 'bg-indigo-950/40 text-indigo-400 border-indigo-500/20' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="py-4 px-3 font-mono text-xs">{user.email}</td>
                        <td className="py-4 px-3">{user.phone || 'N/A'}</td>
                        <td className="py-4 px-3 text-slate-500 text-xs">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="py-4 px-3 text-right">
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-2 hover:bg-rose-500/10 hover:text-rose-400 rounded-lg text-slate-500 transition"
                            title="Delete user"
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-500">
                        No registered users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-6 max-w-lg">
            <div>
              <h3 className="text-xl font-bold text-white">Clinic Configuration</h3>
              <p className="text-xs text-slate-400 mt-0.5">Control the central system parameters and settings</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Clinic Name
                </label>
                <input
                  type="text"
                  required
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Clinic Operational Hours
                </label>
                <input
                  type="text"
                  required
                  value={clinicHours}
                  onChange={(e) => setClinicHours(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition glow-cyan active:scale-[0.99] flex items-center gap-2"
            >
              {savingSettings ? 'Saving Settings...' : 'Save Configuration'}
            </button>
          </form>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-white font-sans">Audit Trail logs</h3>
              <p className="text-xs text-slate-400 mt-0.5">Query the last 100 system audit records</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 uppercase text-xs font-extrabold tracking-wider">
                    <th className="py-4 px-3">Timestamp</th>
                    <th className="py-4 px-3">User</th>
                    <th className="py-4 px-3">Action</th>
                    <th className="py-4 px-3">Details</th>
                    <th className="py-4 px-3 font-mono">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300 font-medium">
                  {loading && logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-500">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Querying audit data...
                      </td>
                    </tr>
                  ) : logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-4 px-3 text-xs text-slate-500 font-mono">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-4 px-3">
                          <div className="font-bold text-white">{log.user_name || 'System'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{log.user_email || 'cron/service'}</div>
                        </td>
                        <td className="py-4 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-cyan-400 border border-slate-700">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-xs leading-relaxed">{log.details}</td>
                        <td className="py-4 px-3 font-mono text-xs text-slate-400">{log.ip_address || '127.0.0.1'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-500">
                        No security logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Register Staff Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] border border-white/10 rounded-3xl p-6 max-w-md w-full relative shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-cyan-400" />
                Register New User Account
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Bruce Banner"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                  >
                    <option value="Doctor">Doctor</option>
                    <option value="Receptionist">Receptionist</option>
                    <option value="Admin">Admin Manager</option>
                    <option value="Patient">Patient</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="bruce@medq.com"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                />
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
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                />
              </div>

              {role === 'Doctor' && (
                <div className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl space-y-4">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Doctor Specific Details</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Specialization</label>
                      <input
                        type="text"
                        value={specialization}
                        onChange={(e) => setSpecialization(e.target.value)}
                        placeholder="Cardiology"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Room Number</label>
                      <input
                        type="text"
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                        placeholder="Room 1"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Fee ($)</label>
                      <input
                        type="number"
                        value={consultationFee}
                        onChange={(e) => setConsultationFee(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Avg Duration (mins)</label>
                      <input
                        type="number"
                        value={avgDuration}
                        onChange={(e) => setAvgDuration(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition glow-cyan active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {loading ? 'Registering...' : 'Register User'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
