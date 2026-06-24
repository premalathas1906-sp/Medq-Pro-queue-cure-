// Sound service using preloaded chime audio and Web Speech Synthesis

const CHIME_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav';
const chimeAudio = new Audio(CHIME_URL);
chimeAudio.preload = 'auto';
chimeAudio.load();

let currentVolume = parseFloat(localStorage.getItem('medq_volume') || '0.5');
let isMuted = localStorage.getItem('medq_muted') === 'true';

export const getVolume = () => currentVolume;
export const getMuted = () => isMuted;

// Pre-warm Web Speech Synthesis voices to populate browser cache on load
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

export const setVolume = (vol: number) => {
  currentVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem('medq_volume', currentVolume.toString());
};

export const setMuted = (muted: boolean) => {
  isMuted = muted;
  localStorage.setItem('medq_muted', isMuted ? 'true' : 'false');
};

// Fallback Synthesized double-chime using Web Audio API
let audioCtx: AudioContext | null = null;
const playSynthesizedChime = () => {
  try {
    if (isMuted) return;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const ctx = audioCtx;
    if (!ctx) return;

    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2 * currentVolume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(554.37, now, 0.4);
    playTone(440.00, now + 0.25, 0.6);
  } catch (e) {
    console.error('[Sound Service] Fallback synthesized chime failed:', e);
  }
};

export const playChime = () => {
  try {
    console.log('[Sound Service] playChime invoked. Volume:', currentVolume, 'Muted:', isMuted);
    if (isMuted) return;
    
    // Primary: Synthesized double-beep chime using Web Audio API (100% offline and reliable)
    playSynthesizedChime();
    
    // Secondary: Also try playing the preloaded chime WAV file
    chimeAudio.currentTime = 0;
    chimeAudio.volume = currentVolume * 0.5;
    chimeAudio.play().catch(() => {
      // Ignore errors since we already played the synthesized tone
    });
  } catch (err) {
    console.error('[Sound Service] Failed to play chime:', err);
  }
};

// Announcement via Text-To-Speech
export const announceToken = (
  token: string,
  langCode: 'en' | 'hi' | 'ta' | 'te' = 'en',
  roomNumber: string = '1'
) => {
  if (!('speechSynthesis' in window)) return;

  // Clear previous queue to prevent stacking speak requests
  window.speechSynthesis.cancel();

  // Clean room number formatting (extract digits only for clarity if e.g. "Room 1")
  const roomDigits = roomNumber.replace(/\D/g, '') || '1';

  // Format token for clear digit-by-digit reading (e.g. P-101 -> P 1 0 1)
  const tokenParts = token.split('-');
  const letter = tokenParts[0] || 'P';
  const numberDigits = tokenParts[1] ? tokenParts[1].split('').join(' ') : '';
  const formattedToken = `${letter} ${numberDigits}`;

  let text = '';
  if (langCode === 'hi') {
    text = `टोकन ${formattedToken}, कृपया कमरा नंबर ${roomDigits} पर जाएं।`;
  } else if (langCode === 'ta') {
    text = `டோக்கన్ ${formattedToken}, தயవుசெய்து அறை எண் ${roomDigits}க்கு செல்லவும்.`;
  } else if (langCode === 'te') {
    text = `టోకెన్ ${formattedToken}, దయచేసి గది నంబర్ ${roomDigits} కు వెళ్లండి.`;
  } else {
    text = `Token ${formattedToken}, please proceed to Room ${roomDigits}.`;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85; // Slightly slower, professional rate
  utterance.pitch = 1.0; 
  utterance.volume = isMuted ? 0 : currentVolume;
  
  // Set language and try to find a matching voice
  let langTag = 'en-US';
  if (langCode === 'hi') langTag = 'hi-IN';
  else if (langCode === 'ta') langTag = 'ta-IN';
  else if (langCode === 'te') langTag = 'te-IN';

  utterance.lang = langTag;

  // Try to find a voice that matches the language tag
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(
    voice => voice.lang.toLowerCase().replace('_', '-').startsWith(langCode) || voice.lang.includes(langTag)
  );
  if (preferredVoice) {
    utterance.voice = preferredVoice;
    utterance.lang = langTag;
  } else if (langCode !== 'en') {
    // If the browser doesn't have the chosen language voice installed (very common for HI/TA/TE on standard setups),
    // read in English using default English voice instead of failing silently.
    console.warn(`[Sound Service] Speech voice for ${langTag} not found. Falling back to English voice.`);
    utterance.text = `Token ${formattedToken}, please proceed to Room ${roomDigits}.`;
    utterance.lang = 'en-US';
    const englishVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
  } else {
    utterance.lang = 'en-US';
    const englishVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
  }

  console.log('[Sound Service] announceToken speaking. Text:', text, 'Lang:', utterance.lang, 'Voice:', utterance.voice?.name || 'Default');

  // Play chime first
  playChime();
  
  // Speak announcement immediately (without setTimeout) to prevent Chrome from throttling background tab timers
  if ('speechSynthesis' in window) {
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }
};

export const unlockAudio = () => {
  try {
    // Reset volume and unmute state on unlock to guarantee audio audibility
    isMuted = false;
    currentVolume = 0.8;
    localStorage.setItem('medq_muted', 'false');
    localStorage.setItem('medq_volume', '0.8');

    // 1. Unlock standard HTML5 Audio element
    chimeAudio.volume = 0.001;
    chimeAudio.play().then(() => {
      chimeAudio.pause();
      chimeAudio.currentTime = 0;
      chimeAudio.volume = 0.8;
    }).catch(e => {
      console.log('[Sound Service] Audio element unlock failed:', e);
    });

    // 2. Unlock Web Audio API AudioContext
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // 3. Unlock Web Speech Synthesis
    if ('speechSynthesis' in window) {
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0;
      window.speechSynthesis.speak(silentUtterance);
    }

    console.log('[Sound Service] Audio engines unlocked successfully');
  } catch (err) {
    console.warn('[Sound Service] Audio unlock error:', err);
  }
};
