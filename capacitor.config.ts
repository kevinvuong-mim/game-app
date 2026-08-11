import type { CapacitorConfig } from '@capacitor/cli';

const liveReloadUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  webDir: 'dist',
  appName: 'Memora',
  appId: 'com.vraxion.memora',
  plugins: {
    StatusBar: {
      overlaysWebView: true,
    },
    SplashScreen: {
      showSpinner: false,
      launchAutoHide: false,
      backgroundColor: '#6b97b2',
    },
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  server: {
    androidScheme: 'https',
    ...(liveReloadUrl
      ? { url: liveReloadUrl, cleartext: liveReloadUrl.startsWith('http://') }
      : {}),
  },
};

export default config;
