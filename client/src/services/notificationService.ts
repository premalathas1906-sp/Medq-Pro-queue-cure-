// Notification service to handle Web Notification API

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export const sendNotification = (title: string, options?: NotificationOptions) => {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png', // Medical cross icon
        badge: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
        silent: false,
        vibrate: [200, 100, 200],
        ...options,
      } as any);
    } catch (e) {
      console.error('Failed to create notification', e);
      // Fallback for some mobile browsers that support registration-based notifications only
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, options);
        }).catch(err => console.error('Service worker notification failed', err));
      }
    }
  } else {
    console.log('Notification permission not granted for:', title);
  }
};
