import { useState, useEffect, useCallback } from 'react';
import { pushService } from '../services/pushService';

/**
 * Manages push notification subscription state for the authenticated user.
 * Registers the service worker on mount and exposes subscribe/unsubscribe.
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const supported = pushService.isSupported();
    setIsSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    // Register SW and check existing subscription
    pushService.registerServiceWorker().then(() => {
      pushService.isSubscribed().then(setIsSubscribed);
    });

    // Listen for subscription renewal from the SW
    const handleMessage = (event) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        const sub = event.data.subscription;
        if (sub) {
          import('../supabase').then(({ supabase }) => {
            supabase
              .from('push_subscriptions')
              .upsert(
                { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
                { onConflict: 'endpoint' },
              );
          });
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
      const result = await pushService.subscribe();
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
      const result = await pushService.unsubscribe();
      if (result.success) setIsSubscribed(false);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
