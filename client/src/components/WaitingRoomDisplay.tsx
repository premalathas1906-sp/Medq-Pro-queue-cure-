import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Monitor, Clock, Users, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { getVolume, getMuted, setVolume, setMuted, announceToken, unlockAudio } from '../services/soundService';
import { useLanguageStore } from '../utils/i18n';
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

interface WaitingRoomProps {
  onBack?: () => void;
}

export const WaitingRoomDisplay: React.FC<WaitingRoomProps> = ({ onBack }) => {
  const { language } = useLanguageStore();

  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [waitingQueue, setWaitingQueue] = useState<Patient[]>([]);
  const [totalWaiting, setTotalWaiting] = useState(0);
  
  const [flashCalled, setFlashCalled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(getMuted());
  const [volumeVal, setVolumeVal] = useState(getVolume());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
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

  const fetchWaitingQueue = async () => {
    try {
      const res = await api.get('/queue');
      
      // Set active patient (if multiple, pick the first one)
      if (res.data.activePatients && res.data.activePatients.length > 0) {
        setActivePatient(res.data.activePatients[0]);
      } else {
        setActivePatient(null);
      }

      // Next 5 waiting tokens
      if (res.data.waitingQueue) {
        setWaitingQueue(res.data.waitingQueue.slice(0, 5));
        setTotalWaiting(res.data.totalWaiting);
      }
    } catch (err) {
      console.error('Failed to load queue data on waiting display:', err);
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
    // Update live clock
    const clockTimer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);

    fetchWaitingQueue();

    const socket = io(SOCKET_URL);

    socket.on('queue_updated', () => {
      fetchWaitingQueue();
    });

    socket.on('token_called', (nextPatient: { token: string; name: string; room: string; doctorName: string }) => {
      // Prevent duplicate playback
      if (lastAnnouncedTokenRef.current === nextPatient.token) return;
      lastAnnouncedTokenRef.current = nextPatient.token;

      fetchWaitingQueue();
      
      // Trigger flashing visual indicator (3 seconds as requested)
      setFlashCalled(true);
      setToastMsg(`Now Calling: Token ${nextPatient.token} → ${nextPatient.room}`);

      const flashTimer = setTimeout(() => {
        setFlashCalled(false);
      }, 3000);

      const toastTimer = setTimeout(() => {
        setToastMsg(null);
      }, 4000);

      // Multilingual Text-To-Speech Chime Call (synchronizes with active app language)
      announceToken(nextPatient.token, language as any, nextPatient.room);

      return () => {
        clearTimeout(flashTimer);
        clearTimeout(toastTimer);
      };
    });

    socket.on('wait_time_updated', () => {
      fetchWaitingQueue();
    });

    return () => {
      clearInterval(clockTimer);
      socket.disconnect();
    };
  }, []);

  return (
    <div className={`flex-1 flex flex-col justify-between p-8 transition-all duration-500 relative overflow-hidden ${
      flashCalled ? 'bg-cyan-950/20 border-cyan-500/30' : 'bg-[#070b14]'
    }`}>
      {/* Background glow blur */}
      <div className="absolute top-0 left-1/4 h-[300px] w-[300px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Panel */}
      <div className="flex justify-between items-center border-b border-white/5 pb-5 z-10">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 bg-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-500/20 text-cyan-400">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">Waiting Room Display</h2>
            <p className="text-xs text-slate-400">Live check-in slots and serving tracker</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 hover:text-white border border-white/5 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <span>← Exit TV Mode</span>
            </button>
          )}

          {/* Volume controls */}
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

          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-bold text-white font-mono">{time}</span>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 py-8 items-stretch z-10">
        
        {/* Left Pane (Col span 2) - Current Active Token */}
        <div className={`lg:col-span-2 flex flex-col justify-center items-center text-center glass-card rounded-3xl p-8 border relative transition-all duration-500 ${
          flashCalled 
            ? 'border-cyan-500/40 bg-cyan-950/20 scale-[1.01] shadow-[0_0_30px_rgba(6,182,212,0.15)]' 
            : 'border-white/5'
        }`}>
          {activePatient ? (
            <div className="space-y-6">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black bg-cyan-950/50 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest animate-pulse">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                Now Serving Patient
              </span>
              
              {/* Giant serving token text */}
              <h1 className={`text-9xl md:text-[11rem] font-black tracking-tight text-white transition-all duration-300 ${
                flashCalled ? 'scale-105 text-cyan-400 drop-shadow-[0_0_40px_rgba(6,182,212,0.5)]' : ''
              }`}>
                {activePatient.token}
              </h1>

              <div className="space-y-2 mt-4">
                <p className="text-2xl font-bold text-slate-200">{activePatient.patient_name}</p>
                <div className="flex justify-center gap-4 text-sm font-semibold">
                  <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1.5 rounded-xl">
                    🏥 {activePatient.room_number}
                  </span>
                  <span className="bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-xl">
                    🩺 {activePatient.doctor_name}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Sparkles className="h-16 w-16 text-slate-600 mx-auto animate-pulse" />
              <h1 className="text-3xl font-black text-white tracking-tight">No Active Consultations</h1>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                Doctors are currently updating records or on break. Token numbers will appear here live when called.
              </p>
            </div>
          )}
        </div>

        {/* Right Pane (Col span 1) - Next 5 waiting tokens */}
        <div className="glass-card rounded-3xl p-6 border border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-4">
              <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">Next 5 In Line</span>
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                {totalWaiting} Waiting
              </span>
            </div>

            <div className="space-y-3">
              {waitingQueue.length > 0 ? (
                waitingQueue.map((patient, index) => {
                  const estMins = Math.ceil((patient.estimatedWaitSeconds || 0) / 60);
                  
                  return (
                    <div
                      key={patient.id}
                      className="p-3 bg-slate-950/50 border border-white/5 rounded-2xl flex items-center justify-between hover:border-cyan-500/20 transition duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-center font-bold text-white text-xs">
                          {index + 1}
                        </div>
                        <div>
                          <span className="text-sm font-bold text-white block">{patient.token}</span>
                          <span className="text-[10px] text-slate-400 block">{patient.patient_name}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-semibold text-cyan-400 block font-mono">
                          {estMins} mins wait
                        </span>
                        <span className="text-[9px] text-slate-500 block truncate max-w-[100px]">
                          {patient.doctor_name}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-16 text-slate-500 text-xs">
                  📭 Queue is empty.<br />New patient check-ins will list here.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 mt-4 text-center">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">MedQ Pro Live Display</span>
          </div>
        </div>

      </div>

      {/* Footer Banner */}
      <div className="border-t border-white/5 pt-4 flex justify-between items-center text-xs text-slate-500 z-10">
        <p>Please stand by the room entry doors when your token number turns RED.</p>
        <div className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
          <span>Audio Callouts Active</span>
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
