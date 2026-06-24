import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { UserPlus, Play, Settings, RefreshCw, Users, Clock, CheckCircle, AlertTriangle, Printer, X, ShieldAlert } from 'lucide-react';
import { getQrCodeUrl } from '../services/qrCodeHelper';
import { useQueueStore, type Patient } from '../store/queueStore';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

const SOCKET_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

interface Doctor {
  doctor_id: string;
  doctor_name: string;
  specialization: string;
  room_number: string;
  status: 'Available' | 'Busy' | 'Break' | 'Offline';
}

export const ReceptionistDashboard: React.FC = () => {
  const queueStore = useQueueStore();
  const authStore = useAuthStore();
  
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  
  // Registration Form States
  const [patientName, setPatientName] = useState('');
  const [registerDoctorId, setRegisterDoctorId] = useState('');
  const [priority, setPriority] = useState<'Emergency' | 'Senior Citizen' | 'Pregnant' | 'Child' | 'Normal'>('Normal');
  const [note, setNote] = useState('');
  
  const [defaultTime, setDefaultTime] = useState('10');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [printPatient, setPrintPatient] = useState<Patient | null>(null);
  
  // Emergency alert toast banner
  const [emergencyToast, setEmergencyToast] = useState<{ token: string; name: string; message: string } | null>(null);

  // Fetch doctors list
  const fetchDoctors = async () => {
    try {
      const response = await api.get('/doctors');
      const docList = response.data.doctors || [];
      setDoctors(docList);
      if (docList.length > 0 && !registerDoctorId) {
        setRegisterDoctorId(docList[0].doctor_id);
      }
    } catch (err) {
      console.error('Failed to fetch doctors:', err);
    }
  };

  // Load initial queue data and settings
  const loadInitialData = async () => {
    await fetchDoctors();
    // Fetch settings
    try {
      const settingsRes = await api.get('/queue/settings');
      const defaultTimeSetting = settingsRes.data.settings?.find((s: any) => s.key === 'defaultConsultationTime');
      if (defaultTimeSetting) {
        setDefaultTime(JSON.parse(defaultTimeSetting.value).toString());
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
    queueStore.fetchQueue(selectedDoctorId === 'all' ? undefined : selectedDoctorId);
  }, [selectedDoctorId]);

  // Connect to live Socket.IO events
  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('queue_updated', () => {
      // Re-fetch queue on any socket update
      queueStore.fetchQueue(selectedDoctorId === 'all' ? undefined : selectedDoctorId);
    });

    socket.on('emergency_alert', (alertData: { token: string; patient_name: string; message: string }) => {
      setEmergencyToast({
        token: alertData.token,
        name: alertData.patient_name,
        message: alertData.message
      });
      // Play high priority warning chime if speech support is allowed or audio context is ready
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch (e) {
        console.warn('Audio play failed:', e);
      }
    });

    socket.on('doctor_status_changed', () => {
      fetchDoctors();
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedDoctorId]);

  // Consulting timer for the active patient
  // We use the first active patient in the selected filter (or globally)
  const activePatient = queueStore.activePatients[0] || null;

  useEffect(() => {
    if (!activePatient || !activePatient.called_at) {
      setElapsedSeconds(0);
      return;
    }

    const calledTime = new Date(activePatient.called_at).getTime();
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - calledTime) / 1000)));

    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - calledTime) / 1000)));
    }, 1000);

    return () => clearInterval(timer);
  }, [activePatient]);

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim() || !registerDoctorId) return;

    const success = await queueStore.addPatient(patientName, registerDoctorId, priority, note);
    if (success) {
      // Find the patient we just registered in the newly fetched waiting list
      // Since it's sorted, we can search by name in waitingQueue
      setTimeout(() => {
        const justAdded = queueStore.waitingQueue.find(p => p.patient_name === patientName);
        if (justAdded) {
          setPrintPatient(justAdded);
        }
      }, 500);

      // Reset fields
      setPatientName('');
      setNote('');
      setPriority('Normal');
    }
  };

  const handleCallNext = async () => {
    if (selectedDoctorId === 'all') {
      alert('Please select a specific doctor in the dropdown to call their next patient.');
      return;
    }
    await queueStore.callNext(selectedDoctorId);
  };

  const handleUpdateSettings = async (timeVal: string) => {
    setDefaultTime(timeVal);
    const parsed = parseFloat(timeVal);
    if (isNaN(parsed) || parsed <= 0) return;

    try {
      await api.post('/queue/settings', { key: 'defaultConsultationTime', value: parsed });
    } catch (err) {
      console.error('Failed to update target setting:', err);
    }
  };

  const handleResetQueue = async () => {
    if (!window.confirm('Are you sure you want to delete all waiting and active tokens and reset count to P-101?')) {
      return;
    }
    await queueStore.resetQueue();
  };

  // Quick Injector for demonstration
  const handleQuickAdd = async (demoName: string, demoPriority: 'Emergency' | 'Senior Citizen' | 'Pregnant' | 'Child' | 'Normal') => {
    if (doctors.length === 0) return;
    // Auto assign doctor
    const targetDoc = doctors[0].doctor_id;
    await queueStore.addPatient(demoName, targetDoc, demoPriority, 'Demo patient check-in');
  };

  // Helper to format duration seconds
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      
      {/* Emergency banner alert */}
      {emergencyToast && (
        <div className="mb-6 p-4 bg-rose-950/40 border border-rose-500/30 rounded-2xl flex justify-between items-center text-rose-300 animate-bounce">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0" />
            <div>
              <span className="font-extrabold uppercase text-xs tracking-wider block text-rose-400">Emergency Check-In</span>
              <span className="text-sm font-semibold">{emergencyToast.message}</span>
            </div>
          </div>
          <button 
            onClick={() => setEmergencyToast(null)}
            className="p-1.5 hover:bg-rose-900/30 rounded-lg text-rose-400 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Title Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span className="h-4 w-4 rounded-full bg-cyan-400 animate-pulse glow-cyan" />
            Clinic Queue Desk
          </h1>
          <p className="text-slate-400 mt-1">Receptionist Desk Dashboard & Check-In</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Doctor filter dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Queue for:</span>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="bg-slate-900 border border-slate-700 focus:border-cyan-500 text-sm font-bold text-white rounded-xl px-3 py-2 focus:outline-none"
            >
              <option value="all">All Doctors (Combined View)</option>
              {doctors.map((d) => (
                <option key={d.doctor_id} value={d.doctor_id}>
                  {d.doctor_name} ({d.specialization})
                </option>
              ))}
            </select>
          </div>

          {authStore.user?.role === 'Admin' && (
            <button
              onClick={handleResetQueue}
              className="flex items-center gap-2 px-4 py-2 border border-rose-500/30 bg-rose-950/20 hover:bg-rose-500/20 text-rose-300 text-xs font-bold rounded-xl transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset All Queues
            </button>
          )}
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 border border-cyan-500/10">
          <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Waiting Line</span>
            <span className="text-2xl font-black text-white">{queueStore.totalWaiting}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 border border-emerald-500/10">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Consultations Completed</span>
            <span className="text-2xl font-black text-white">{queueStore.completedCount}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 col-span-2 sm:col-span-1">
          <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
            <Clock className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Avg Consult Duration</span>
            <span className="text-2xl font-black text-white">
              {formatTime(activePatient?.avgConsultationSeconds || 300)}
            </span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 col-span-2 sm:col-span-1">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
            <Settings className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Target Consult</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                value={defaultTime}
                onChange={(e) => handleUpdateSettings(e.target.value)}
                className="w-16 bg-slate-900 border border-slate-700 rounded-lg text-white font-bold text-center text-sm py-1 focus:outline-none focus:border-cyan-500"
                min="1"
                max="60"
              />
              <span className="text-xs text-slate-400">mins</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Active patient consult, Patient registration form */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Patient Panel */}
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden border border-emerald-500/20">
            <div className="absolute top-0 right-0 h-[100px] w-[100px] bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-start">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider mb-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Currently In Consultation
                </span>
                
                {activePatient ? (
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">
                      {activePatient.patient_name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-400 font-semibold">
                      <span className="px-2 py-0.5 bg-slate-800 rounded text-slate-300 border border-slate-700">
                        {activePatient.priority}
                      </span>
                      <span>Token: <strong className="text-white">{activePatient.token}</strong></span>
                      <span className="px-2 py-0.5 bg-cyan-950/40 text-cyan-400 rounded text-xs border border-cyan-500/20">
                        Room: {activePatient.room_number || 'Room 1'}
                      </span>
                      <span className="text-indigo-400">Doctor: {activePatient.doctor_name}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-2xl font-bold text-slate-500">No Patient in Consultation</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      {selectedDoctorId === 'all' 
                        ? 'Select a specific doctor first to call their next patient.' 
                        : 'Click "Call Next Patient" to pull the next patient.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Consultation Clock */}
              {activePatient && (
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Duration</span>
                  <span className="text-3xl font-mono font-bold text-emerald-400">{formatTime(elapsedSeconds)}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 border-t border-white/5 pt-6 flex gap-4">
              <button
                onClick={handleCallNext}
                disabled={queueStore.loading || queueStore.waitingQueue.length === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold transition duration-300 shadow-lg ${
                  queueStore.waitingQueue.length > 0
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 glow-emerald active:scale-[0.98]'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                <Play className="h-5 w-5 fill-current" />
                {activePatient ? 'Call Next Patient' : 'Call First Patient'}
              </button>
            </div>
          </div>

          {/* Add Patient Check-in Form */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
              <UserPlus className="h-5 w-5 text-cyan-400" />
              Patient Check-In & Registration
            </h3>
            
            <form onSubmit={handleRegisterPatient} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Patient Name
                  </label>
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Assign Doctor
                  </label>
                  <select
                    required
                    value={registerDoctorId}
                    onChange={(e) => setRegisterDoctorId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition text-sm font-semibold"
                  >
                    <option value="" disabled>Select Doctor...</option>
                    {doctors.map((d) => (
                      <option key={d.doctor_id} value={d.doctor_id}>
                        {d.doctor_name} ({d.specialization}) - {d.status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Priority Category
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition text-sm font-semibold"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Child">Child (Priority 2)</option>
                    <option value="Pregnant">Pregnant (Priority 3)</option>
                    <option value="Senior Citizen">Senior Citizen (Priority 4)</option>
                    <option value="Emergency">Emergency (Priority 5 - Top Sorted)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Symptom Notes / Details (Optional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g., Blood pressure check, cough, cold"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={queueStore.loading || !patientName.trim()}
                className={`w-full py-3 px-6 rounded-xl font-bold transition duration-200 mt-2 ${
                  patientName.trim()
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 glow-cyan active:scale-[0.99]'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                {queueStore.loading ? 'Registering...' : 'Register and Auto-Assign Token'}
              </button>
            </form>

            {/* Quick Demo Adding panel */}
            <div className="mt-6 border-t border-white/5 pt-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-3">Demo Quick Check-In</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickAdd('David Miller', 'Normal')}
                  className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 transition"
                >
                  + David (Normal)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd('Sophia Garcia', 'Child')}
                  className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 transition"
                >
                  + Sophia (Child)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd('James Wilson', 'Emergency')}
                  className="px-3 py-1.5 bg-rose-950/20 hover:bg-rose-900/20 border border-rose-500/20 rounded-lg text-xs font-semibold text-rose-300 transition animate-pulse"
                >
                  + James (Emergency)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Live Queue Line */}
        <div>
          <div className="glass-card rounded-2xl p-6 h-full flex flex-col min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-400" />
                Queue Line
              </h3>
              <span className="px-2.5 py-1 bg-indigo-950/40 text-indigo-400 border border-indigo-500/20 rounded-full text-xs font-bold">
                {queueStore.waitingQueue.length} Waiting
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[550px]">
              {queueStore.waitingQueue.length > 0 ? (
                queueStore.waitingQueue.map((patient, idx) => (
                  <div
                    key={patient.token}
                    className="flex justify-between items-center p-3.5 bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-cyan-500/20 rounded-xl transition duration-150 relative overflow-hidden"
                  >
                    {patient.priority === 'Emergency' && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
                    )}
                    
                    <div className="flex items-center gap-3">
                      <div className={`flex flex-col items-center justify-center h-11 w-11 rounded-lg font-bold border text-xs ${
                        patient.priority === 'Emergency' 
                          ? 'bg-rose-950/30 text-rose-400 border-rose-500/30 animate-pulse' 
                          : 'bg-slate-800 text-cyan-400 border-slate-700'
                      }`}>
                        <span>T</span>
                        <span>{patient.token.split('-')[1]}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                          {patient.patient_name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                            patient.priority === 'Emergency' ? 'bg-rose-950/40 text-rose-400 border-rose-500/20' :
                            patient.priority === 'Senior Citizen' ? 'bg-amber-950/40 text-amber-400 border-amber-500/20' :
                            'bg-slate-800 text-slate-400 border-slate-700/60'
                          }`}>
                            {patient.priority}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                            to {patient.doctor_name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <span className="text-xs font-semibold text-indigo-300 block">
                          #{idx + 1} in line
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block">
                          ~{Math.round(patient.estimatedWaitSeconds ? patient.estimatedWaitSeconds / 60 : 0)} mins
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setPrintPatient(patient)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 hover:text-cyan-400 border border-slate-700/80 rounded-lg text-slate-400 transition"
                          title="Print Token Slip"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        
                        <button
                          type="button"
                          onClick={async () => await queueStore.skipPatient(patient.id)}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-rose-950/20 hover:text-rose-400 border border-slate-700/80 rounded text-[9px] font-bold text-slate-500 transition"
                          title="Skip Patient"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 border border-dashed border-white/5 rounded-2xl">
                  <AlertTriangle className="h-10 w-10 text-slate-600 mb-3" />
                  <span className="text-sm font-bold">No Patients in Line</span>
                  <span className="text-xs text-slate-400 mt-1">New check-ins will display here.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print Slip Dialog Modal */}
      {printPatient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] border border-white/10 rounded-3xl p-6 max-w-sm w-full relative shadow-2xl space-y-6 text-center">
            <button
              onClick={() => setPrintPatient(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <span className="text-[10px] font-extrabold uppercase text-cyan-400 tracking-widest bg-cyan-950/40 border border-cyan-500/20 px-3 py-1 rounded-full">
                Appointment Token Slip
              </span>
              <h3 className="text-4xl font-black text-white mt-4 tracking-tight">{printPatient.token}</h3>
              <p className="text-base font-bold text-slate-300 mt-2">{printPatient.patient_name}</p>
              <div className="flex items-center justify-center gap-2 mt-1 text-xs text-slate-500">
                <span>Doctor: {printPatient.doctor_name}</span>
                <span>•</span>
                <span>Room: {printPatient.room_number || 'Room 1'}</span>
              </div>
            </div>

            {/* Dynamic themed QR Code */}
            <div className="flex justify-center p-4 bg-slate-900/60 border border-white/5 rounded-2xl">
              <img
                src={getQrCodeUrl(printPatient.token)}
                alt={`QR code for ${printPatient.token}`}
                className="h-44 w-44 rounded-xl border border-cyan-500/20 shadow-inner"
              />
            </div>

            <div className="text-xs text-slate-400 leading-relaxed">
              Scan this QR code with your phone to track your queue position and live estimated wait time.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl transition active:scale-[0.99]"
              >
                Print Slip
              </button>
              <button
                onClick={() => setPrintPatient(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-2.5 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
