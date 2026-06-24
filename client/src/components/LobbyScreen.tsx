import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Monitor, Volume2, Users, LayoutGrid, Clock, VolumeX } from 'lucide-react';
import { getVolume, getMuted, setVolume, setMuted, announceToken, unlockAudio } from '../services/soundService';
import api from '../services/api';

const SOCKET_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

interface Patient {
  id: string;
  token: string;
  patient_name: string;
  priority: string;
  doctor_id: string;
  doctor_name: string;
  room_number: string;
  estimatedWaitSeconds?: number;
}

interface Doctor {
  doctor_id: string;
  doctor_name: string;
  specialization: string;
  room_number: string;
  status: 'Available' | 'Busy' | 'Break' | 'Offline';
}

interface LobbyScreenProps {
  onBack?: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({ onBack }) => {
  const [activePatients, setActivePatients] = useState<Patient[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  
  const [lastCalled, setLastCalled] = useState<{ token: string; name: string; room: string; doctorName: string } | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(getMuted());
  const [volumeVal, setVolumeVal] = useState(getVolume());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [announceLang, setAnnounceLang] = useState<'en' | 'hi' | 'ta' | 'te'>('en');
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const handleUnlockAudio = () => {
    unlockAudio();
    setVoiceMuted(false);
    setVolumeVal(0.8);
    setAudioUnlocked(true);
  };

  const lastAnnouncedTokenRef = useRef<string | null>(null);

  const handleMuteToggle = () => {
    const nextMuted = !voiceMuted;
    setVoiceMuted(nextMuted);
    setMuted(nextMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = parseFloat(e.target.value);
    setVolumeVal(nextVol);
    setVolume(nextVol);
    if (voiceMuted && nextVol > 0) {
      setVoiceMuted(false);
      setMuted(false);
    }
  };

  const fetchQueueAndDoctors = async () => {
    try {
      const qRes = await api.get('/queue');
      setActivePatients(qRes.data.activePatients || []);
      setWaitingQueue(qRes.data.waitingQueue || []);

      const dRes = await api.get('/doctors');
      setDoctors(dRes.data.doctors || []);
    } catch (err) {
      console.error('Lobby failed to fetch live queue data:', err);
    }
  };

  useEffect(() => {
    const handleInteraction = () => {
      unlockAudio();
      setAudioUnlocked(true);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  useEffect(() => {
    fetchQueueAndDoctors();

    const socket = io(SOCKET_URL);

    socket.on('queue_updated', () => {
      fetchQueueAndDoctors();
    });

    socket.on('token_called', (nextPatient: { token: string; name: string; room: string; doctorName: string }) => {
      // Prevent duplicate playback
      if (lastAnnouncedTokenRef.current === nextPatient.token) return;
      lastAnnouncedTokenRef.current = nextPatient.token;

      setLastCalled(nextPatient);
      setFlashActive(true);
      setToastMsg(`Now Calling: Token ${nextPatient.token} → ${nextPatient.room}`);

      const toastTimer = setTimeout(() => setToastMsg(null), 4000);
      const flashTimer = setTimeout(() => setFlashActive(false), 3000); // 3 seconds flashing banner as requested

      // Multilingual Text-To-Speech Chime Call
      announceToken(nextPatient.token, announceLang, nextPatient.room);

      return () => {
        clearTimeout(toastTimer);
        clearTimeout(flashTimer);
      };
    });

    socket.on('doctor_status_changed', () => {
      fetchQueueAndDoctors();
    });

    return () => {
      socket.disconnect();
    };
  }, [announceLang]);

  return (
    <div className={`flex-1 flex flex-col justify-between p-8 transition-all duration-500 ${
      flashActive ? 'bg-cyan-950/30' : 'bg-[#070b14]'
    } relative overflow-hidden`}>
      
      {/* Glow animations */}
      <div className="absolute top-0 left-1/4 h-[350px] w-[350px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 h-[350px] w-[350px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Lobby Top Controls bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-5 z-10">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 bg-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-500/20 text-cyan-400">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">Main Lobby TV Screen</h2>
            <p className="text-xs text-slate-400">Live Multilingual Announcements Board</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 hover:text-white border border-white/5 rounded-xl text-xs font-bold transition"
            >
              <span>← Exit TV Mode</span>
            </button>
          )}
          {/* Announcement Language */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Language:</span>
            <select
              value={announceLang}
              onChange={(e) => setAnnounceLang(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 focus:border-cyan-500 text-xs font-bold text-white rounded-xl px-2.5 py-1.5 focus:outline-none"
            >
              <option value="en">English (US)</option>
              <option value="hi">हिन्दी (India)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="te">తెలుగు (Telugu)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <button
              onClick={handleMuteToggle}
              className="text-slate-300 hover:text-white transition"
              title={voiceMuted ? 'Unmute' : 'Mute'}
            >
              {voiceMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-cyan-400" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volumeVal}
              onChange={handleVolumeChange}
              className="w-16 md:w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch flex-1 py-8 z-10">
        
        {/* Left 2 Cols: Main Called Patient Banner */}
        <div className="lg:col-span-2 flex flex-col justify-center items-center text-center glass-card rounded-3xl p-8 border border-white/5 relative">
          
          {lastCalled ? (
            <div className="space-y-6 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black bg-cyan-950/50 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest animate-pulse">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                Now Calling Token
              </span>
              
              {/* GIANT CALL OUT */}
              <h1 className={`text-9xl md:text-[11rem] font-black tracking-tight text-white transition-all duration-300 ${
                flashActive ? 'scale-110 text-cyan-400 drop-shadow-[0_0_50px_rgba(6,182,212,0.65)]' : ''
              }`}>
                {lastCalled.token}
              </h1>

              <div className="space-y-3">
                <h3 className="text-3xl md:text-5xl font-black text-slate-100">{lastCalled.name}</h3>
                <div className="flex items-center justify-center gap-3">
                  <span className="px-3 py-1 bg-cyan-950/40 text-cyan-400 text-sm font-extrabold uppercase rounded-lg border border-cyan-500/20">
                    {lastCalled.room}
                  </span>
                  <span className="text-slate-400 text-lg font-bold">Consulting: {lastCalled.doctorName}</span>
                </div>
              </div>

              <p className="text-slate-400 text-sm italic max-w-sm mx-auto">
                Please proceed to the assigned consultation room immediately.
              </p>
            </div>
          ) : activePatients.length > 0 ? (
            <div className="space-y-6">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
                Currently Serving
              </span>
              <h1 className="text-8xl md:text-[8rem] font-black tracking-tight text-white">
                {activePatients[0].token}
              </h1>
              <div className="space-y-2">
                <h3 className="text-3xl md:text-4xl font-extrabold text-slate-200">{activePatients[0].patient_name}</h3>
                <div className="text-slate-400 text-sm font-semibold">
                  {activePatients[0].room_number} • Doctor: {activePatients[0].doctor_name}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-20 w-20 bg-slate-900 rounded-full flex items-center justify-center border border-white/5 text-slate-600 mx-auto">
                <Users className="h-10 w-10" />
              </div>
              <h3 className="text-2xl font-bold text-slate-500">Welcome to MedQ Pro</h3>
              <p className="text-slate-400 text-sm max-w-xs mx-auto">
                Please register at check-in counter. New token notifications will display here.
              </p>
            </div>
          )}
        </div>

        {/* Right Col: Doctor room Grid monitor */}
        <div className="glass-card rounded-3xl p-6 border border-white/5 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
              <LayoutGrid className="h-5 w-5 text-indigo-400" />
              Room Directory
            </h3>
            <p className="text-xs text-slate-400 mb-6">Live status of clinical consultation rooms</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 max-h-[400px] pr-1">
            {doctors.map((doc) => {
              // Find patient currently active for this doctor
              const activeDocPatient = activePatients.find(p => p.doctor_id === doc.doctor_id);
              const isRoomHighlighted = flashActive && lastCalled && lastCalled.room === doc.room_number;
              
              return (
                <div
                  key={doc.doctor_id}
                  className={`p-4 rounded-2xl flex justify-between items-center transition-all duration-350 ${
                    isRoomHighlighted
                      ? 'bg-cyan-950/40 border-cyan-500/40 scale-[1.02] shadow-[0_0_15px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/30'
                      : 'bg-slate-900/50 border border-white/5'
                  } hover:border-cyan-500/10`}
                >
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">{doc.doctor_name}</h4>
                    <span className="text-[10px] text-slate-500 font-bold block">{doc.specialization}</span>
                    <span className="text-xs font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-900 inline-block mt-2">
                      {doc.room_number}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className={`inline-block h-2 w-2 rounded-full mb-1.5 ${
                      doc.status === 'Available' ? 'bg-emerald-400 animate-pulse' :
                      doc.status === 'Busy' ? 'bg-orange-400' :
                      doc.status === 'Break' ? 'bg-amber-400' :
                      'bg-slate-600'
                    }`} title={doc.status} />
                    
                    {activeDocPatient ? (
                      <div>
                        <div className="text-xs font-extrabold text-cyan-400 font-mono tracking-tight bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded-lg">
                          Serving: {activeDocPatient.token}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-slate-500">
                        {doc.status === 'Available' ? 'Vacant' : doc.status}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upcoming Waitlist panel */}
      <div className="border-t border-white/5 pt-6 mt-6 z-10">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-slate-600" />
          Next upcoming tokens in queue:
        </h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {waitingQueue.slice(0, 4).map((patient, idx) => (
            <div
              key={patient.token}
              className="flex justify-between items-center p-3.5 bg-slate-900/40 border border-white/5 rounded-xl hover:border-cyan-500/10 transition"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700 text-cyan-400 text-xs font-bold">
                  {patient.token.split('-')[1]}
                </div>
                <div>
                  <div className="text-sm font-bold text-white truncate max-w-[90px]">{patient.patient_name}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider leading-none mt-0.5">
                    {patient.doctor_name.split(' ').pop()}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-indigo-300">
                  #{idx + 1} next
                </div>
                <div className="text-[9px] text-slate-500 font-mono">
                  ~{Math.ceil((patient.estimatedWaitSeconds || 0) / 60)} mins
                </div>
              </div>
            </div>
          ))}

          {waitingQueue.length === 0 && (
            <div className="col-span-4 text-center py-4 text-xs font-medium text-slate-600 border border-dashed border-white/5 rounded-xl">
              Waiting list is currently empty.
            </div>
          )}

          {waitingQueue.length > 0 && waitingQueue.length < 4 && (
            Array.from({ length: 4 - waitingQueue.length }).map((_, i) => (
              <div key={i} className="hidden sm:flex items-center justify-center p-3.5 border border-dashed border-white/5 text-xs text-slate-600 font-medium rounded-xl">
                Waiting...
              </div>
            ))
          )}
        </div>
      </div>

      {toastMsg && (
        <div className="fixed bottom-8 right-8 z-50 bg-cyan-950/95 border border-cyan-500/40 text-cyan-100 px-6 py-4 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.4)] font-black text-sm tracking-wide animate-bounce flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-cyan-400 animate-ping" />
          {toastMsg}
        </div>
      )}

      {!audioUnlocked && (
        <div 
          onClick={handleUnlockAudio}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-amber-500 hover:bg-amber-400 text-slate-950 px-6 py-3.5 rounded-2xl shadow-2xl font-black text-xs md:text-sm flex items-center gap-3 cursor-pointer border border-amber-400/20 active:scale-95 transition"
        >
          <Volume2 className="h-5 w-5 shrink-0" />
          <span>Click anywhere on this screen to activate voice announcements & chimes</span>
        </div>
      )}
    </div>
  );
};
