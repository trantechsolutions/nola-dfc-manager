import { useState, useEffect, useCallback } from 'react';
import { pushService } from '../services/pushService';
import { isNative } from '../native/platform';
import { nativePush } from '../native/push';

/**
 * Manages push notification subscription state for the authenticated user.
 * Registers the service worker on mount and exposes subscribe/unsubscribe.
 * Inside the iOS / Android app the same switch drives the phone's own notifications (src/native/push.js).
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isNative) {
      let live = true;
      setIsSupported(true);
      nativePush.getPermission().then((p) => live && setPermission(p));
      nativePush.isSubscribed().then((on) => live && setIsSubscribed(on));
      return () => {
        live = false;
      };
    }

    const supported = pushService.isSupported();
    setIsSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    // Register the worker, re-file this browser's subscription with the server, then read the switch's state.
    pushService
      .refresh()
      .then(() => pushService.isSubscribed())
      .then(setIsSubscribed);

    // The worker renewed a subscription the browser replaced: file the new one under this account.
    const handleMessage = (event) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        const sub = event.data.subscription;
        if (sub) {
          pushService.saveSubscription(sub).catch(() => {});
          setIsSubscribed(true);
        } else {
          setIsSubscribed(false);
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, []);

  const subscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await (isNative ? nativePush : pushService).subscribe();
      if (result.success) {
        setIsSubscribed(true);
        setPermission('granted');
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await (isNative ? nativePush : pushService).unsubscribe();
      if (result.success) setIsSubscribed(false);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
