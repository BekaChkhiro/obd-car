import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/src/theme/colors';

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
  const insets = useSafeAreaInsets();
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
          style={[styles.container, bgStyle(toast.type), { opacity, top: insets.top + 12 }]}
          pointerEvents="none"
          accessibilityLiveRegion={toast.type === 'error' ? 'assertive' : 'polite'}
          accessibilityRole="alert"
        >
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

function bgStyle(type: ToastType): { backgroundColor: string; borderColor: string } {
  switch (type) {
    case 'warning':
      return { backgroundColor: 'rgba(251, 191, 36, 0.12)', borderColor: 'rgba(251, 191, 36, 0.35)' };
    case 'error':
      return { backgroundColor: 'rgba(248, 113, 113, 0.12)', borderColor: 'rgba(248, 113, 113, 0.35)' };
    default:
      return { backgroundColor: 'rgba(34, 211, 238, 0.12)', borderColor: 'rgba(34, 211, 238, 0.35)' };
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
