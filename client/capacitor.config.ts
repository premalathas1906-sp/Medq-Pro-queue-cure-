import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.medq.app',
  appName: 'MedQ',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
