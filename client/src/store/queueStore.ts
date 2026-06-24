import { create } from 'zustand';
import api from '../services/api';

interface Patient {
  id: string;
  token: string;
  patient_name: string;
  patient_id: string | null;
  doctor_id: string;
  doctor_name: string;
  room_number: string;
  priority: 'Emergency' | 'Senior Citizen' | 'Pregnant' | 'Child' | 'Normal';
  status: 'Waiting' | 'Active' | 'Completed' | 'Skipped';
  added_at: string;
  called_at: string | null;
  completed_at: string | null;
  estimatedWaitSeconds?: number;
  tokensAhead?: number;
  confidence?: number;
  avgConsultationSeconds?: number;
  note?: string;
}

interface QueueState {
  activePatients: Patient[];
  waitingQueue: Patient[];
  completedCount: number;
  totalWaiting: number;
  loading: boolean;
  error: string | null;
  fetchQueue: (doctorId?: string) => Promise<void>;
  addPatient: (name: string, doctorId: string, priority: string, note?: string) => Promise<boolean>;
  callNext: (doctorId: string) => Promise<boolean>;
  completeConsultation: (queueId: string, diagnosis: string, symptoms: string, prescription: any[], billingAmount: number) => Promise<boolean>;
  skipPatient: (queueId: string) => Promise<boolean>;
  recallPatient: (queueId: string) => Promise<boolean>;
  resetQueue: () => Promise<boolean>;
}

export const useQueueStore = create<QueueState>((set) => ({
  activePatients: [],
  waitingQueue: [],
  completedCount: 0,
  totalWaiting: 0,
  loading: false,
  error: null,

  fetchQueue: async (doctorId) => {
    set({ loading: true });
    try {
      const url = doctorId ? `/queue?doctor_id=${doctorId}` : '/queue';
      const response = await api.get(url);
      const { activePatients, waitingQueue, completedCount, totalWaiting } = response.data;
      set({ 
        activePatients, 
        waitingQueue, 
        completedCount, 
        totalWaiting, 
        loading: false 
      });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to load queue data', loading: false });
    }
  },

  addPatient: async (name, doctorId, priority, note) => {
    try {
      await api.post('/queue/patients', { patient_name: name, doctor_id: doctorId, priority, note });
      return true;
    } catch (err) {
      console.error('Add patient to queue failed:', err);
      return false;
    }
  },

  callNext: async (doctorId) => {
    try {
      await api.post('/queue/next', { doctor_id: doctorId });
      return true;
    } catch (err) {
      console.error('Call next patient failed:', err);
      return false;
    }
  },

  completeConsultation: async (queueId, diagnosis, symptoms, prescription, billingAmount) => {
    try {
      await api.post('/queue/complete', {
        queue_id: queueId,
        diagnosis,
        symptoms,
        prescription,
        billing_amount: billingAmount
      });
      return true;
    } catch (err) {
      console.error('Complete consultation failed:', err);
      return false;
    }
  },

  skipPatient: async (queueId) => {
    try {
      await api.post('/queue/skip', { queue_id: queueId });
      return true;
    } catch (err) {
      console.error('Skip patient failed:', err);
      return false;
    }
  },

  recallPatient: async (queueId) => {
    try {
      await api.post('/queue/recall', { queue_id: queueId });
      return true;
    } catch (err) {
      console.error('Recall patient failed:', err);
      return false;
    }
  },

  resetQueue: async () => {
    try {
      await api.post('/queue/reset');
      return true;
    } catch (err) {
      console.error('Reset queue failed:', err);
      return false;
    }
  }
}));
export type { Patient };
