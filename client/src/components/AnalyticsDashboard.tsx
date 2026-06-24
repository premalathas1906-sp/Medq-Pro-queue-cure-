import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { BarChart as BarIcon, TrendingUp, Users, Clock, CheckCircle, FileText, Download, RefreshCw, Activity, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts';

const SOCKET_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

interface AnalyticsSummary {
  total: number;
  completed: number;
  waiting: number;
  skipped: number;
  emergency: number;
}

interface DoctorStat {
  name: string;
  specialization: string;
  totalSeen: number;
  avgDurationMinutes: number;
}

interface HourlyStat {
  hour: string;
  count: number;
}

export const AnalyticsDashboard: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary>({
    total: 0,
    completed: 0,
    waiting: 0,
    skipped: 0,
    emergency: 0
  });
  const [doctors, setDoctors] = useState<DoctorStat[]>([]);
  const [hourly, setHourly] = useState<HourlyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportRange, setReportRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await api.get('/analytics');
      if (response.data.success) {
        setSummary(response.data.summary);
        setDoctors(response.data.doctors || []);
        setHourly(response.data.hourly || []);
      }
    } catch (err) {
      console.error('Failed to load analytics statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();

    const socket = io(SOCKET_URL);
    socket.on('queue_updated', () => {
      fetchAnalytics();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleExportCSV = () => {
    const token = localStorage.getItem('token');
    const baseUrl = typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001';
    const url = `${baseUrl}/api/analytics/reports/csv?range=${reportRange}&token=${token || ''}`;
    window.open(url, '_blank');
  };

  const handleExportPDF = () => {
    const token = localStorage.getItem('token');
    const baseUrl = typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001';
    const url = `${baseUrl}/api/analytics/reports/pdf?range=${reportRange}&token=${token || ''}`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header and Download Report selectors */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <BarIcon className="h-7 w-7 text-indigo-400" />
            Clinic Queue Analytics
          </h1>
          <p className="text-slate-400 mt-1">Live Performance & Clinical Metrics</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Range:</span>
            <select
              value={reportRange}
              onChange={(e) => setReportRange(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 focus:border-cyan-500 text-xs font-bold text-white rounded-xl px-2.5 py-1.5 focus:outline-none"
            >
              <option value="daily">Today (Daily)</option>
              <option value="weekly">This Week (Weekly)</option>
              <option value="monthly">This Month (Monthly)</option>
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-xl transition shadow-lg glow-cyan"
          >
            <FileText className="h-3.5 w-3.5" />
            Print PDF Report
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/10">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Checked-In</span>
            <span className="text-2xl font-black text-white">{summary.total}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/10">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Visits Completed</span>
            <span className="text-2xl font-black text-white">{summary.completed}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/10">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Currently Waiting</span>
            <span className="text-2xl font-black text-white">{summary.waiting}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/10">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Emergency Cases</span>
            <span className="text-2xl font-black text-white">{summary.emergency}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 col-span-2 lg:col-span-1">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/10">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Skipped/No-Show</span>
            <span className="text-2xl font-black text-white">{summary.skipped}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-3xl p-16 text-center text-slate-500 border border-white/5 shadow-2xl">
          <RefreshCw className="h-10 w-10 animate-spin text-cyan-400 mx-auto mb-3" />
          <h3 className="font-bold text-white text-lg">Analyzing Data...</h3>
          <p className="text-xs text-slate-400 mt-1">Generating graphs and processing clinic consultation figures.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Hourly volume area chart */}
          <div className="glass-card rounded-3xl p-6 border border-white/5 flex flex-col justify-between shadow-xl">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-cyan-400" />
                Hourly Traffic Volume
              </h3>
              <p className="text-xs text-slate-400">Patient registration counts across operational hours</p>
            </div>
            
            <div className="h-80 w-full font-mono text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" stroke="#64748b" />
                  <YAxis stroke="#64748b" allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" name="Patients Checked-In" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Doctor Performance Bar Chart */}
          <div className="glass-card rounded-3xl p-6 border border-white/5 flex flex-col justify-between shadow-xl">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-400" />
                Doctor consultation Performance
              </h3>
              <p className="text-xs text-slate-400">Total patients treated and average consultation duration (mins)</p>
            </div>

            <div className="h-80 w-full font-mono text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={doctors} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" tickFormatter={(v) => v.split(' ').pop() || v} />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Legend />
                  <Bar dataKey="totalSeen" fill="#6366f1" name="Completed Visits" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgDurationMinutes" fill="#06b6d4" name="Avg Consult Time (Mins)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
