import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Play, Clipboard, Clock, UserCheck, Plus, Trash2 } from 'lucide-react';
import { useQueueStore } from '../store/queueStore';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

const SOCKET_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

export const DoctorDashboard: React.FC = () => {
  const queueStore = useQueueStore();
  const authStore = useAuthStore();
  
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [callingNext, setCallingNext] = useState(false);
  const [completing, setCompleting] = useState(false);
  
  // Status state
  const [doctorStatus, setDoctorStatus] = useState<'Available' | 'Busy' | 'Break' | 'Offline'>('Offline');
  const [roomNum, setRoomNum] = useState('Room 1');

  // Consultation Details state
  const [diagnosis, setDiagnosis] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [bp, setBp] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [temperature, setTemperature] = useState('');
  const [billingAmount, setBillingAmount] = useState('100');
  
  // Prescription List
  const [medications, setMedications] = useState<string[]>([]);
  const [newMed, setNewMed] = useState('');

  // Doctor ID from session details
  const doctorId = authStore.details?.id || 'd-01';

  // Load doctor details
  const loadDoctorProfile = () => {
    if (authStore.details) {
      setDoctorStatus(authStore.details.status || 'Offline');
      setRoomNum(authStore.details.room_number || 'Room 1');
    }
  };

  useEffect(() => {
    loadDoctorProfile();
    queueStore.fetchQueue(doctorId);
  }, [authStore.details]);

  // Connect to socket for live updates
  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('queue_updated', () => {
      queueStore.fetchQueue(doctorId);
    });

    socket.on('doctor_status_changed', (updatedDoc: any) => {
      if (updatedDoc.id === doctorId) {
        setDoctorStatus(updatedDoc.status);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [doctorId]);

  // Consulting timer for the active patient
  // Find active patient assigned specifically to this doctor
  const activePatient = queueStore.activePatients.find(p => p.doctor_id === doctorId) || null;

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

  const handleCallNext = async () => {
    setCallingNext(true);
    try {
      await queueStore.callNext(doctorId);
    } finally {
      setCallingNext(false);
    }
  };

  const handleStatusChange = async (newStatus: 'Available' | 'Busy' | 'Break' | 'Offline') => {
    try {
      const response = await api.post('/doctors/status', { status: newStatus });
      if (response.data.success) {
        setDoctorStatus(newStatus);
        if (authStore.user) {
          // Sync store session
          authStore.checkSession();
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleRoomChange = async (newRoom: string) => {
    setRoomNum(newRoom);
    try {
      await api.post('/doctors/room', { roomNumber: newRoom });
    } catch (err) {
      console.error('Failed to update room number:', err);
    }
  };

  const handleAddMedication = () => {
    if (newMed.trim()) {
      setMedications([...medications, newMed.trim()]);
      setNewMed('');
    }
  };

  const handleRemoveMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleCompleteConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient) return;

    setCompleting(true);
    try {
      const diagnosisText = `${diagnosis}. Vitals: BP=${bp || 'Normal'}, HR=${heartRate || 'Normal'}, Temp=${temperature || 'Normal'}`;
      const success = await queueStore.completeConsultation(
        activePatient.id,
        diagnosisText,
        symptoms || 'General consult',
        medications,
        parseFloat(billingAmount) || 100.0
      );

      if (success) {
        // Reset states
        setDiagnosis('');
        setSymptoms('');
        setBp('');
        setHeartRate('');
        setTemperature('');
        setMedications([]);
        // Call next automatically or refresh queue
        queueStore.fetchQueue(doctorId);
      }
    } finally {
      setCompleting(false);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  // Filter queue for this doctor
  const waitingPatientsForDoc = queueStore.waitingQueue.filter(p => p.doctor_id === doctorId);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header & Status Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-emerald-400" />
            Doctor's Consultation Desk
          </h1>
          <p className="text-slate-400 mt-1">
            Room: <input 
              type="text" 
              value={roomNum} 
              onChange={(e) => handleRoomChange(e.target.value)}
              className="bg-transparent border-b border-slate-700 text-white focus:outline-none focus:border-cyan-500 w-20 font-bold"
            /> • Specialty: {authStore.details?.specialization || 'General'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-900 border border-white/5 px-3 py-2 rounded-xl">
            {waitingPatientsForDoc.length} Patients waiting
          </span>

          {/* Status buttons */}
          <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-white/5">
            {(['Available', 'Busy', 'Break', 'Offline'] as const).map((status) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  doctorStatus === status
                    ? status === 'Available' ? 'bg-emerald-500 text-slate-950 glow-emerald' :
                      status === 'Busy' ? 'bg-orange-500 text-slate-950' :
                      status === 'Break' ? 'bg-amber-500 text-slate-950' :
                      'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Active Consultation & Clinical details Form */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Patient Details */}
          <div className="glass-card rounded-2xl p-6 border border-emerald-500/20 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider mb-4 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Active Consultation
                </span>
                
                {activePatient ? (
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-white tracking-tight">
                      {activePatient.patient_name}
                    </h2>
                    <div className="flex items-center gap-3 font-semibold text-sm">
                      <span className="text-xs uppercase text-slate-300 bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded">
                        {activePatient.priority}
                      </span>
                      <span className="text-cyan-400">Token: {activePatient.token}</span>
                    </div>
                    {activePatient.note && (
                      <div className="bg-slate-900/60 border border-white/5 p-3 rounded-xl mt-2 text-sm text-slate-300 italic">
                        <strong>Complaint/Symptoms:</strong> "{activePatient.note}"
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h2 className="text-2xl font-bold text-slate-500">No Active Patient</h2>
                    <p className="text-sm text-slate-400 mt-1">Please call the next patient in line when ready.</p>
                  </div>
                )}
              </div>

              {activePatient && (
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Timer</span>
                  <span className="text-3xl font-mono font-bold text-emerald-400">{formatTime(elapsedSeconds)}</span>
                </div>
              )}
            </div>

            {/* Call Next Button */}
            {!activePatient && (
              <div className="mt-8 pt-6 border-t border-white/5">
                <button
                  onClick={handleCallNext}
                  disabled={callingNext || waitingPatientsForDoc.length === 0}
                  className={`w-full py-4 px-6 rounded-xl font-bold transition duration-300 flex justify-center items-center gap-2 shadow-lg ${
                    waitingPatientsForDoc.length > 0
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 glow-emerald active:scale-[0.98]'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <Play className="h-5 w-5 fill-current" />
                  Call First Patient
                </button>
              </div>
            )}
          </div>

          {/* Clinical Checkup Forms */}
          {activePatient && (
            <form onSubmit={handleCompleteConsultation} className="glass-card rounded-2xl p-6 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2 border-b border-white/5 pb-3">
                <Clipboard className="h-5 w-5 text-indigo-400" />
                Clinical Examination Notes
              </h3>

              {/* Vitals Section */}
              <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl space-y-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Clinical Vitals</span>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Blood Pressure</label>
                    <input
                      type="text"
                      placeholder="e.g. 120/80"
                      value={bp}
                      onChange={(e) => setBp(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Heart Rate (bpm)</label>
                    <input
                      type="text"
                      placeholder="e.g. 72"
                      value={heartRate}
                      onChange={(e) => setHeartRate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Temperature (°F)</label>
                    <input
                      type="text"
                      placeholder="e.g. 98.6"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Symptoms and Diagnosis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Symptoms Observed</label>
                  <textarea
                    rows={2}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder="e.g., persistent dry cough, sore throat, mild fatigue"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Diagnosis / Assessment</label>
                  <textarea
                    rows={2}
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="e.g., Acute upper respiratory tract infection"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Prescription builder */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Prescriptions & Advised Treatment</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newMed}
                    onChange={(e) => setNewMed(e.target.value)}
                    placeholder="e.g. Paracetamol 650mg TDS x 5 days"
                    className="flex-1 bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddMedication}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold transition flex items-center gap-1.5 text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>

                {medications.length > 0 && (
                  <div className="space-y-2 bg-slate-900/30 border border-white/5 p-3 rounded-2xl">
                    {medications.map((med, index) => (
                      <div key={index} className="flex justify-between items-center bg-slate-950/60 px-3 py-2 rounded-xl border border-white/5 text-sm text-slate-300 font-medium">
                        <span>{med}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMedication(index)}
                          className="p-1 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-lg transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Billing and Submit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end pt-4 border-t border-white/5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Consultation Billing Fee ($)</label>
                  <input
                    type="number"
                    value={billingAmount}
                    onChange={(e) => setBillingAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={completing}
                  className="w-full py-3 px-6 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold rounded-xl transition shadow-lg glow-emerald"
                >
                  {completing ? 'Completing Consultation...' : 'Record Consultation & Complete Visit'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Side: Waiting Line Queue */}
        <div>
          <div className="glass-card rounded-2xl p-6 h-full flex flex-col min-h-[500px]">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
              <Clock className="h-5 w-5 text-cyan-400" />
              Patient Waitlist
            </h3>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[550px]">
              {waitingPatientsForDoc.length > 0 ? (
                waitingPatientsForDoc.map((patient, idx) => (
                  <div
                    key={patient.token}
                    className="p-3.5 bg-slate-900/60 border border-white/5 rounded-xl flex justify-between items-center hover:border-cyan-500/20 transition relative overflow-hidden"
                  >
                    {patient.priority === 'Emergency' && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
                    )}

                    <div>
                      <h4 className="text-sm font-bold text-white">{patient.patient_name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                          patient.priority === 'Emergency' ? 'bg-rose-950/40 text-rose-400 border-rose-500/20' :
                          'bg-slate-800 text-slate-400 border-slate-700/60'
                        }`}>
                          {patient.priority}
                        </span>
                        <span className="text-xs font-bold text-cyan-400">{patient.token}</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className="text-xs font-semibold text-indigo-300 block">
                        #{idx + 1} next
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ~{Math.round((patient.estimatedWaitSeconds || 0) / 60)} mins
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 border border-dashed border-white/5 rounded-2xl">
                  No upcoming patients in queue.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
