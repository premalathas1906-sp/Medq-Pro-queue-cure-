import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Search, Bell, Clock, Compass, BellOff, HelpCircle, Heart, ArrowRight, LogOut, Volume2, VolumeX } from 'lucide-react';
import { HealthTips } from './HealthTips';
import { requestNotificationPermission, sendNotification } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { getVolume, getMuted, setVolume, setMuted, announceToken } from '../services/soundService';
import { useLanguageStore } from '../utils/i18n';
import api from '../services/api';

const SOCKET_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

interface Patient {
  token: string;
  name: string;
  note: string;
  type: string;
  addedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  estimatedWaitSeconds?: number;
  tokensAhead?: number;
}

interface QueueState {
  activePatient: Patient | null;
  waitingQueue: Patient[];
  completedCount: number;
  averageConsultationSeconds: number;
  defaultConsultationTime: number;
  totalWaiting: number;
}

export const PatientDashboard: React.FC = () => {
  const authStore = useAuthStore();
  const isAuthenticated = authStore.isAuthenticated && authStore.user?.role === 'Patient';
  const patientUser = authStore.user;

  const [queue, setQueue] = useState<QueueState | null>(null);
  const [searchToken, setSearchToken] = useState('');
  const [trackedToken, setTrackedToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Voice & announcement states
  const { language } = useLanguageStore();
  const [voiceMuted, setVoiceMuted] = useState(getMuted());
  const [volumeVal, setVolumeVal] = useState(getVolume());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [ownTokenCalled, setOwnTokenCalled] = useState<{ token: string; name: string; room: string; doctorName: string } | null>(null);

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

  // Self-queuing states
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [loadingJoin, setLoadingJoin] = useState(false);

  // Check URL params for token on load & request permissions
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setTrackedToken(tokenParam.toUpperCase());
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  // Fetch doctors & active queue entry if logged in
  const fetchActiveStatusAndDoctors = () => {
    if (isAuthenticated) {
      api.get('/queue/my-active')
        .then(res => {
          if (res.data.hasActive) {
            setTrackedToken(res.data.queueEntry.token);
          } else {
            setTrackedToken(null);
          }
        })
        .catch(err => console.error('Error fetching active token:', err));

      api.get('/doctors')
        .then(res => {
          if (res.data.success) {
            setDoctors(res.data.doctors);
            if (res.data.doctors.length > 0 && !selectedDoctorId) {
              setSelectedDoctorId(res.data.doctors[0].doctor_id);
            }
          }
        })
        .catch(err => console.error('Error fetching doctors:', err));
    }
  };

  useEffect(() => {
    fetchActiveStatusAndDoctors();
  }, [isAuthenticated]);

  // Connect to websocket
  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      console.log('Connected to queue socket');
    });

    socket.on('queue_updated', (updatedQueue: QueueState) => {
      setQueue(updatedQueue);

      // Check if tracked token is still in the queue
      if (trackedToken) {
        const isActive = updatedQueue.activePatient && updatedQueue.activePatient.token === trackedToken;
        const isWaiting = updatedQueue.waitingQueue.some(p => p.token === trackedToken);

        if (!isActive && !isWaiting) {
          // Concluded or removed
          if (isAuthenticated) {
            // Patient completed their visit, refresh active status
            fetchActiveStatusAndDoctors();
          }
        }
      }
    });

    socket.on('patient_called', (calledPatient: Patient) => {
      if (trackedToken && calledPatient.token === trackedToken) {
        sendNotification("It's your turn!", {
          body: `Hi ${calledPatient.name}, you have been called to the consultation room!`,
          requireInteraction: true
        });
      }
    });

    socket.on('token_called', (called: any) => {
      console.log('[Socket] Token called:', called);
      if (trackedToken && called.token === trackedToken) {
        if (lastAnnouncedTokenRef.current === called.token) return;
        lastAnnouncedTokenRef.current = called.token;

        // Play chime and voice announcement
        announceToken(called.token, language as any, called.room);

        // Show a 5-second toast
        setToastMsg(`Now Calling: Token ${called.token} → ${called.room}`);
        
        // Show a calling overlay modal
        setOwnTokenCalled(called);

        setTimeout(() => {
          setToastMsg(null);
        }, 5000);
      }
    });

    socket.on('wait_time_updated', (updated: any) => {
      console.log('[Socket] Wait time updated:', updated);
    });

    return () => {
      socket.disconnect();
    };
  }, [trackedToken, isAuthenticated, language]);

  // Effect to alert patient if they are 1 or 2 tokens away when the queue updates
  useEffect(() => {
    if (!queue || !trackedToken) return;

    const index = queue.waitingQueue.findIndex(p => p.token === trackedToken);
    
    if (index === 0) {
      sendNotification("You are next in line!", {
        body: "Please stand by the consultation door.",
        tag: 'next-alert'
      });
    } else if (index === 1) {
      sendNotification("2 Tokens Away!", {
        body: "Get ready, your consultation is coming up soon.",
        tag: 'close-alert'
      });
    }
  }, [queue, trackedToken]);

  const handleTrackToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchToken.trim()) return;

    const formatted = searchToken.trim().toUpperCase();
    let tokenToTrack = formatted;
    if (!formatted.startsWith('P-') && !isNaN(Number(formatted))) {
      tokenToTrack = `P-${formatted}`;
    }

    setTrackedToken(tokenToTrack);
    
    const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?token=${tokenToTrack}`;
    window.history.pushState({ path: newurl }, '', newurl);
  };

  const handleJoinQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId) {
      alert('Please select a doctor.');
      return;
    }

    setLoadingJoin(true);
    try {
      const res = await api.post('/queue/join', { doctor_id: selectedDoctorId });
      if (res.data.success) {
        setTrackedToken(res.data.token);
        fetchActiveStatusAndDoctors();
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to join the queue. Please try again.');
    } finally {
      setLoadingJoin(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }

    const granted = await requestNotificationPermission();
    if (granted) {
      setNotificationsEnabled(true);
      sendNotification("Notifications Activated", {
        body: "You will receive an alert when it is your turn or when you are close."
      });
    } else {
      alert("Notification permission denied. Please enable them in your browser settings to receive alerts.");
    }
  };

  const testNotification = () => {
    if (!notificationsEnabled) {
      alert("Please enable notification updates first.");
      return;
    }
    sendNotification("Queue Demo Alert", {
      body: "This is a demonstration notification. It works!",
    });
  };

  const getTrackedPatientInfo = () => {
    if (!queue || !trackedToken) return null;

    if (queue.activePatient && queue.activePatient.token === trackedToken) {
      return {
        patient: queue.activePatient,
        status: 'active',
        tokensAhead: 0,
        waitMinutes: 0
      };
    }

    const index = queue.waitingQueue.findIndex(p => p.token === trackedToken);
    if (index !== -1) {
      const patient = queue.waitingQueue[index];
      return {
        patient,
        status: 'waiting',
        tokensAhead: index,
        waitMinutes: Math.ceil((patient.estimatedWaitSeconds || 0) / 60)
      };
    }

    return null;
  };

  const patientStatus = getTrackedPatientInfo();

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Welcome & Navigation Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500 fill-rose-500/20" />
          Patient Portal
        </h1>
        {isAuthenticated && (
          <button
            onClick={async () => {
              await authStore.logout();
              setTrackedToken(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-750 border border-slate-700 hover:text-white rounded-lg text-xs font-bold transition"
          >
            <LogOut className="h-3.5 w-3.5 text-slate-400" />
            Sign Out
          </button>
        )}
      </div>

      {isAuthenticated && (
        <div className="mb-6 p-4 glass-card rounded-2xl border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20 font-bold text-sm">
              👤
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider block">Logged In Patient</span>
              <span className="text-sm font-bold text-white">{patientUser?.name}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block font-mono">{patientUser?.phone}</span>
            <span className="text-[10px] text-slate-400 block">{patientUser?.email}</span>
          </div>
        </div>
      )}

      {/* Main Flow: Tracked Token Display */}
      {trackedToken ? (
        <div className="space-y-6">
          {/* Main Status Display */}
          <div className="glass-card rounded-3xl p-6 shadow-xl relative overflow-hidden border border-white/5">
            {/* Quick Change Token / Exit Queue Button */}
            {!isAuthenticated && (
              <button
                onClick={() => {
                  setTrackedToken(null);
                  window.history.pushState({}, '', window.location.pathname);
                }}
                className="absolute top-4 right-4 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700"
              >
                Change Token
              </button>
            )}

            <span className="text-xs uppercase font-bold text-slate-400 block tracking-widest">Tracking Appointment</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black text-cyan-400">{trackedToken}</span>
              {patientStatus?.patient && (
                <span className="text-sm font-semibold text-slate-400">({patientStatus.patient.name})</span>
              )}
            </div>

            {/* Smart Alerts depending on position */}
            {patientStatus ? (
              <div className="mt-6">
                {patientStatus.status === 'active' && (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-center glow-emerald animate-pulse">
                    <span className="text-2xl font-black text-emerald-400 block">IT'S YOUR TURN!</span>
                    <span className="text-sm text-emerald-300 mt-1 block">Please enter the Consultation Room immediately.</span>
                  </div>
                )}

                {patientStatus.status === 'waiting' && patientStatus.tokensAhead === 0 && (
                  <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-2xl text-center glow-rose animate-pulse">
                    <span className="text-xl font-black text-rose-400 block">YOU ARE NEXT IN LINE!</span>
                    <span className="text-sm text-rose-300 mt-1 block">Please stand by the room entrance door.</span>
                  </div>
                )}

                {patientStatus.status === 'waiting' && patientStatus.tokensAhead === 1 && (
                  <div className="p-4 bg-amber-950/30 border border-amber-500/20 rounded-2xl text-center">
                    <span className="text-lg font-black text-amber-400 block">YOU ARE 2 TOKENS AWAY</span>
                    <span className="text-sm text-amber-300 mt-0.5 block">Be ready. Your consultation is next.</span>
                  </div>
                )}

                {patientStatus.status === 'waiting' && patientStatus.tokensAhead > 1 && (
                  <div className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl text-center">
                    <span className="text-sm font-semibold text-indigo-300 block uppercase tracking-wide">Status: Waiting Comfortably</span>
                    <span className="text-xs text-slate-400 mt-0.5 block">There are {patientStatus.tokensAhead} patients ahead of you.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 p-4 bg-slate-900/60 border border-slate-700/50 rounded-2xl text-center text-slate-400">
                {queue ? (
                  <div>
                    <span className="font-bold text-white block">Token Not Active in Queue</span>
                    <span className="text-xs mt-1 block">Your visit might have concluded, or this token is expired. Check with receptionist.</span>
                  </div>
                ) : (
                  <span>Connecting to server and loading queue...</span>
                )}
              </div>
            )}

            {/* Waiting Time Stats */}
            {patientStatus && patientStatus.status === 'waiting' && (
              <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5">
                <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-cyan-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Est. Wait</span>
                    <span className="text-lg font-bold text-white">
                      {patientStatus.waitMinutes} mins
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                  <Search className="h-5 w-5 text-indigo-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ahead of You</span>
                    <span className="text-lg font-bold text-white">
                      {patientStatus.tokensAhead} {patientStatus.tokensAhead === 1 ? 'patient' : 'patients'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Real-time sync notifications settings */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${notificationsEnabled ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}>
                  {notificationsEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Browser Notifications</h4>
                  <p className="text-xs text-slate-400">Receive alerts when called or next</p>
                </div>
              </div>
              <button
                onClick={handleToggleNotifications}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  notificationsEnabled
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                }`}
              >
                {notificationsEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleMuteToggle}
                      className={`p-2 rounded-lg ${voiceMuted ? 'bg-rose-500/10 text-rose-400' : 'bg-cyan-500/10 text-cyan-400'} border border-white/5 hover:border-cyan-500/20`}
                    >
                      {voiceMuted ? (
                        <VolumeX className="h-5 w-5" />
                      ) : (
                        <Volume2 className="h-5 w-5" />
                      )}
                    </button>
                    <div>
                      <h4 className="text-sm font-bold text-white">Voice Announcement</h4>
                      <p className="text-xs text-slate-400">Audible chime & token callout</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase min-w-[32px]">Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volumeVal}
                    onChange={handleVolumeChange}
                    className="flex-1 accent-cyan-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 font-mono w-8 text-right">
                    {Math.round(volumeVal * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {notificationsEnabled && (
              <div className="mt-2 pt-3 border-t border-white/5 flex justify-end">
                <button
                  onClick={testNotification}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                >
                  <HelpCircle className="h-3 w-3" />
                  Send Test Alert
                </button>
              </div>
            )}
          </div>

          {/* Health Tips Carousel */}
          <HealthTips />
        </div>
      ) : (
        /* If no tracked token is set: either display Authenticated Join Queue or Anonymous Tracker */
        <div className="space-y-6">
          {isAuthenticated ? (
            /* Logged-In Patient: Select Doctor and Join Queue */
            <div className="glass-card rounded-3xl p-6 shadow-xl border border-white/5 space-y-6">
              <div className="text-center">
                <Compass className="h-10 w-10 text-cyan-400 mx-auto mb-2 animate-bounce" />
                <h3 className="text-lg font-bold text-white">Join Clinic Queue</h3>
                <p className="text-xs text-slate-400 mt-1">Select an active doctor to get your ticket instantly.</p>
              </div>

              {doctors.length === 0 ? (
                <div className="text-center p-6 bg-slate-900/60 border border-white/5 rounded-2xl text-slate-400 text-xs">
                  🏥 There are no active doctors on duty right now. Please check back later.
                </div>
              ) : (
                <form onSubmit={handleJoinQueue} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Select Doctor & Room
                    </label>
                    <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1">
                      {doctors.map((doc) => {
                        const isSelected = selectedDoctorId === doc.doctor_id;
                        const isAvailable = doc.status === 'Available';
                        const isBusy = doc.status === 'Busy';
                        const isBreak = doc.status === 'Break';
                        
                        return (
                          <div
                            key={doc.doctor_id}
                            onClick={() => setSelectedDoctorId(doc.doctor_id)}
                            className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                                : 'bg-slate-900/60 border-white/5 hover:border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-300">
                                🩺
                              </div>
                              <div>
                                <span className="text-xs font-bold text-white block">{doc.doctor_name}</span>
                                <span className="text-[10px] text-slate-400 block">{doc.specialization} ({doc.room_number})</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold text-slate-400">
                                Est. {doc.avg_duration_minutes}m
                              </span>
                              <span className="flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  isAvailable ? 'bg-emerald-400 glow-emerald' :
                                  isBusy ? 'bg-amber-400' :
                                  isBreak ? 'bg-yellow-400' : 'bg-slate-500'
                                }`} />
                                <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400">
                                  {doc.status}
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loadingJoin}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl transition duration-200 glow-cyan active:scale-[0.99] flex justify-center items-center gap-2"
                  >
                    {loadingJoin ? 'Joining Waitlist...' : 'Confirm & Join Queue'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Anonymous User Tracker Form */
            <div className="glass-card rounded-3xl p-6 shadow-xl space-y-6">
              <div className="text-center">
                <Compass className="h-10 w-10 text-cyan-400 mx-auto mb-2 animate-bounce" />
                <h3 className="text-lg font-bold text-white">Track Your Appointment</h3>
                <p className="text-xs text-slate-400 mt-1">Enter your token number to view live wait status.</p>
              </div>

              <form onSubmit={handleTrackToken} className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={searchToken}
                    onChange={(e) => setSearchToken(e.target.value)}
                    placeholder="e.g. 101 or P-101"
                    className="w-full bg-slate-900/80 border border-slate-700 focus:border-cyan-500 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-bold transition text-center"
                  />
                  <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
                </div>

                <button
                  type="submit"
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl transition duration-200 glow-cyan active:scale-[0.99] flex justify-center items-center gap-2"
                >
                  Track Status
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              {/* Login / Register Prompts for Self Queuing */}
              <div className="border-t border-white/5 pt-4 text-center space-y-3">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">
                  Self-service clinic queuing
                </span>
                <p className="text-xs text-slate-400">
                  Register or login as a patient to select doctors, check in online, and secure a token directly from your device.
                </p>
                <div className="flex gap-3 justify-center">
                  <a
                    href="?view=login"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-xs font-bold transition border border-slate-700"
                  >
                    Sign In
                  </a>
                  <a
                    href="?view=register"
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black transition glow-cyan"
                  >
                    Register Now
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Health Tips for welcome screen */}
          <HealthTips />
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-8 right-8 z-50 bg-cyan-950/95 border border-cyan-500/40 text-cyan-100 px-6 py-4 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.4)] font-black text-sm tracking-wide animate-bounce flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-cyan-400 animate-ping" />
          {toastMsg}
        </div>
      )}

      {ownTokenCalled && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-cyan-500/30 rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-[0_0_50px_rgba(6,182,212,0.25)] animate-in fade-in zoom-in duration-300">
            <div className="h-16 w-16 bg-cyan-500/10 text-cyan-400 rounded-2xl flex items-center justify-center border border-cyan-500/20 text-3xl mx-auto animate-bounce">
              🔔
            </div>
            
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Your Token is Called!</span>
              <h2 className="text-3xl font-black text-white">{ownTokenCalled.token}</h2>
              <p className="text-sm font-bold text-cyan-400">{ownTokenCalled.name}</p>
            </div>

            <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Destination</span>
              <div className="text-lg font-extrabold text-white">{ownTokenCalled.room}</div>
              <div className="text-xs text-slate-400">{ownTokenCalled.doctorName}</div>
            </div>

            <button
              onClick={() => setOwnTokenCalled(null)}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold py-3.5 px-6 rounded-xl transition duration-200 glow-cyan active:scale-[0.99] flex justify-center items-center gap-2"
            >
              Proceed to Doctor
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
