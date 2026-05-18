import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

export type ToastType = 'info' | 'warning' | 'error';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

type ShowToast = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

const DISMISS_AFTER_MS = 4_000;

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [opacity]);

  const showToast = useCallback<ShowToast>(
    (message, type = 'info') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);

      setToast({ id: (nextId.current += 1), message, type });
      opacity.setValue(0);

      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      hideTimer.current = setTimeout(dismiss, DISMISS_AFTER_MS);
    },
    [dismiss, opacity],
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        <Animated.View
          style={[styles.container, bgStyle(toast.type), { opacity }]}
          pointerEvents="none"
        >
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

function bgStyle(type: ToastType): { backgroundColor: string } {
  switch (type) {
    case 'warning':
      return { backgroundColor: '#f59e0b' };
    case 'error':
      return { backgroundColor: '#ef4444' };
    default:
      return { backgroundColor: '#3b82f6' };
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
