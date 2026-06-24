import { create } from 'zustand';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  role: 'Admin' | 'Doctor' | 'Receptionist' | 'Patient';
  name: string;
  phone: string;
  avatar_url?: string;
  isDefaultPassword?: boolean;
}

interface AuthState {
  user: User | null;
  details: any | null; // patient/doctor/receptionist specific fields
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  registerPatient: (fields: { name: string; email: string; phone: string; password: string; dob?: string; gender?: string }) => Promise<boolean>;
  registerUser: (fields: { name: string; email: string; phone: string; password: string; role: string; details?: any }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  updateProfile: (name: string, phone: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  details: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  loading: !!localStorage.getItem('token'),
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      set({ 
        user, 
        token, 
        isAuthenticated: true, 
        loading: false 
      });
      return true;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Login failed. Please check your credentials.';
      set({ error: errMsg, loading: false });
      return false;
    }
  },

  loginWithGoogle: async (credential) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/auth/google', { credential });
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      set({ 
        user, 
        token, 
        isAuthenticated: true, 
        loading: false 
      });
      return true;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Google login failed. Please try again.';
      set({ error: errMsg, loading: false });
      return false;
    }
  },

  registerPatient: async (fields) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/auth/register-patient', fields);
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      set({ 
        user, 
        token, 
        isAuthenticated: true, 
        loading: false 
      });
      return true;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Registration failed. Please check your details.';
      set({ error: errMsg, loading: false });
      return false;
    }
  },

  registerUser: async (fields) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/auth/register', fields);
      set({ loading: false });
      return response.data.success;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Registration failed. Please check your details.';
      set({ error: errMsg, loading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      localStorage.removeItem('token');
      set({ 
        user: null, 
        details: null,
        token: null, 
        isAuthenticated: false, 
        loading: false,
        error: null 
      });
    }
  },

  checkSession: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ 
        user: null, 
        details: null,
        token: null, 
        isAuthenticated: false, 
        loading: false 
      });
      return;
    }
    set({ loading: true });
    try {
      const response = await api.get('/auth/session');
      const { user, details } = response.data;
      set({ 
        user, 
        details,
        isAuthenticated: true, 
        loading: false 
      });
    } catch (err) {
      localStorage.removeItem('token');
      set({ 
        user: null, 
        details: null,
        token: null, 
        isAuthenticated: false, 
        loading: false 
      });
    }
  },

  updateProfile: async (name, phone) => {
    try {
      await api.post('/auth/profile', { name, phone });
      set((state) => ({
        user: state.user ? { ...state.user, name, phone } : null
      }));
      return true;
    } catch (err) {
      console.error('Failed to update profile:', err);
      return false;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      if (res.data.success) {
        set((state) => ({
          user: state.user ? { ...state.user, isDefaultPassword: false } : null
        }));
        return { success: true, message: res.data.message };
      }
      return { success: false, error: 'Failed to change password' };
    } catch (err: any) {
      console.error('Failed to change password:', err);
      return { success: false, error: err.response?.data?.error || 'Failed to change password' };
    }
  }
}));
