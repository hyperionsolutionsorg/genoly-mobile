import { useEffect, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';

/**
 * Lightweight toast layer — the mobile sibling of the web's `src/lib/toast.ts`
 * (decision 2026-06-10): transient feedback only. Confirmations stay on
 * native `Alert.alert` per mobile DESIGN.md §4.
 *
 * Rules mirrored from web: success/info auto-dismiss after 4s; errors persist
 * until tapped; max 3 visible (FIFO).
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 3;

let nextId = 1;
let queue: ToastItem[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l([...queue]);
}

function dismiss(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  queue = queue.filter((item) => item.id !== id);
  emit();
}

function push(kind: ToastKind, message: string) {
  const item: ToastItem = { id: nextId++, kind, message };
  queue = [...queue, item].slice(-MAX_VISIBLE);
  if (kind !== 'error') {
    timers.set(
      item.id,
      setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS),
    );
  }
  emit();
  return item.id;
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
  dismiss,
  /** Test helper — clears all toasts + timers. */
  __reset: () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    queue = [];
    emit();
  },
};

const KIND_ICON: Record<ToastKind, string> = {
  success: '✓',
  error: '⚠︎',
  info: 'ℹ︎',
};

/** Mount ONCE at app root (root _layout), above the navigator. */
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (items) => setToasts(items);
    listeners.add(listener);
    listener([...queue]);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + t.spacing.sm,
        left: t.spacing.lg,
        right: t.spacing.lg,
        zIndex: 1200,
        ...(Platform.OS === 'android' ? { elevation: 6 } : null),
      }}
    >
      {toasts.map((item) => {
        const accent =
          item.kind === 'success'
            ? t.colors.success
            : item.kind === 'error'
              ? t.colors.danger
              : t.colors.info;
        return (
          <TouchableOpacity
            key={item.id}
            accessibilityRole="alert"
            accessibilityLabel={`${item.kind}: ${item.message}`}
            accessibilityHint="Tap to dismiss"
            activeOpacity={0.85}
            onPress={() => dismiss(item.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: t.colors.bgElevated,
              borderRadius: t.radius.sm,
              borderLeftWidth: 3,
              borderLeftColor: accent,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              marginBottom: t.spacing.sm,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              elevation: 6,
            }}
            testID={`toast-${item.kind}`}
          >
            <Text style={{ color: accent, fontSize: 16, marginRight: t.spacing.sm }}>
              {KIND_ICON[item.kind]}
            </Text>
            <Text style={[t.typography.body, { color: t.colors.text, flex: 1 }]}>
              {item.message}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
