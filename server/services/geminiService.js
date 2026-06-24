const { GoogleGenAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let genAI = null;

if (GEMINI_API_KEY) {
  try {
    // Note: The newer GoogleGenAI or GoogleGenerativeAI packages have minor syntax differences.
    // We will initialize the Google Generative AI client.
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('[AI Service] Gemini API Client initialized successfully.');
  } catch (err) {
    console.error('[AI Service] Failed to initialize Gemini API client:', err.message);
  }
} else {
  console.log('[AI Service] No GEMINI_API_KEY provided. Operating in Offline Rule-Based Fallback Mode.');
}

const SYSTEM_PROMPT = `
You are the MedQ Pro Clinical Chatbot Assistant, a professional AI helper for a smart clinic management system.
You only answer questions regarding:
1. Live Queue tracking, wait times, and token checks.
2. Clinic details: MedQ Smart Clinic is open daily from 8:00 AM to 8:00 PM.
3. Doctor schedules: Dr. Stephen Strange (Cardiology, Room 1), Dr. Charles Xavier (Pediatrics, Room 2), Dr. Bruce Banner (General Medicine, Room 3).
4. Vaccination bookings and guidance (Flu, travel boosters in Room 2).
5. Basic First Aid instructions (cuts, burns, sprains).
6. Preparation guidelines for doctor consultations (bring history, reports, scan QR code).

Keep your answers concise, empathetic, professional, and clear. Avoid diagnosing medical conditions. For severe issues, advise dialing emergency services immediately.
`;

// Offline rule-based fallback responses
const getOfflineResponse = (message) => {
  const query = message.toLowerCase();

  if (query.includes('timing') || query.includes('hours') || query.includes('open') || query.includes('close')) {
    return 'MedQ Smart Clinic is open daily from 8:00 AM to 8:00 PM. Patient registration desk opens at 7:30 AM. Doctors start consultations at 8:30 AM.';
  }

  if (query.includes('doctor') || query.includes('specialist') || query.includes('availability') || query.includes('who is in')) {
    return 'We have three specialists on duty:\n- **Dr. Stephen Strange** (Cardiology - Room 1)\n- **Dr. Charles Xavier** (Pediatrics - Room 2)\n- **Dr. Bruce Banner** (General Medicine - Room 3)\nYou can see their real-time availability (Available, Busy, Break, Offline) on the Patient Portal or check with the receptionist.';
  }

  if (query.includes('first aid') || query.includes('burn') || query.includes('cut') || query.includes('sprain') || query.includes('wound')) {
    if (query.includes('burn')) {
      return '🔥 **First Aid for Minor Burns:**\n1. Run cool (not cold) water over the burn for 10-15 minutes.\n2. Do NOT apply ice, butter, or ointments.\n3. Cover loosely with a sterile bandage.\n*If the burn is large, charred, or blistered, seek emergency care immediately.*';
    }
    if (query.includes('sprain')) {
      return '🩹 **First Aid for Sprains (R.I.C.E. Method):**\n- **Rest**: Rest the injured limb.\n- **Ice**: Apply ice packs wrapped in a cloth for 15 mins.\n- **Compress**: Wrap with an elastic bandage.\n- **Elevate**: Prop the limb above heart level.\n*See a doctor to rule out fractures.*';
    }
    return '🩹 **Basic First Aid Guidance:**\n- **Minor Cuts**: Clean with water, apply antiseptic cream, and cover with a sterile band-aid.\n- **Bruises**: Apply a cold compress.\n- **Choking/Severe Bleeding**: Call emergency services immediately and seek physical assistance.';
  }

  if (query.includes('vaccin') || query.includes('shot') || query.includes('immuniz')) {
    return '💉 **Vaccination Services:**\nWe offer routine vaccinations (Flu, COVID-19, childhood boosters, travel immunizations) in Room 2 (Pediatrics). You can get registered at the front desk. Vaccine tokens are auto-assigned as "Vaccine" type.';
  }

  if (query.includes('prepare') || query.includes('consultation') || query.includes('appointment')) {
    return '📋 **Consultation Preparation Checklists:**\n- Bring your medical records, prescription history, and active health insurance card.\n- Arrive 10 minutes early.\n- Register at the receptionist desk to obtain your live QR Token slip.\n- Scan the QR code to keep track of your estimated wait time on your phone.';
  }

  if (query.includes('wait') || query.includes('queue') || query.includes('token') || query.includes('position')) {
    return '⏱️ **Queue & Wait Times:**\nEstimated wait times are dynamically calculated using historical consultation data and doctor speeds. You can track your exact position in line and tokens ahead of you by scanning the QR code printed on your token slip or entering it on the Patient Portal.';
  }

  return 'Hello! I am the MedQ Clinical Assistant. I can help you with details about:\n- Hospital operating hours (8:00 AM - 8:00 PM)\n- Doctor specialization and room numbers\n- Live queue tracking and estimated wait times\n- Basic first aid instructions (burns, sprains, minor wounds)\n- Vaccination schedules\n- Consultation preparation checklists\n\nHow can I help you today?';
};

const askAI = async (userMessage) => {
  // If Gemini client exists, use it
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `${SYSTEM_PROMPT}\n\nUser Question: ${userMessage}\nAssistant Response:`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (err) {
      console.error('[AI Service] Gemini Generation Failed. Falling back to offline engine:', err.message);
      return getOfflineResponse(userMessage);
    }
  }

  // Fallback to offline rule-based responder
  return getOfflineResponse(userMessage);
};

module.exports = {
  askAI
};
