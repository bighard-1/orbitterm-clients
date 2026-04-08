import { tauriInvoke } from './tauri';
import { detectMobileFormFactor } from './runtime';

export type MobileHapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const VIBRATE_PATTERN: Record<MobileHapticKind, number | number[]> = {
  light: 10,
  medium: [14, 12, 14],
  heavy: [18, 14, 18],
  success: [8, 28, 12],
  warning: [16, 20, 16],
  error: [24, 28, 24]
};

const mapImpactStyle = (kind: MobileHapticKind): 'light' | 'medium' | 'heavy' => {
  if (kind === 'success') {
    return 'light';
  }
  if (kind === 'warning') {
    return 'medium';
  }
  if (kind === 'error') {
    return 'heavy';
  }
  return kind;
};

export const triggerMobileHaptic = async (kind: MobileHapticKind = 'light'): Promise<void> => {
  if (!detectMobileFormFactor()) {
    return;
  }

  try {
    await tauriInvoke('mobile_haptic_impact', { style: mapImpactStyle(kind) });
    return;
  } catch (_error) {
    // Fallback to browser vibration if plugin command is unavailable.
  }

  const vibrate = typeof navigator !== 'undefined' ? navigator.vibrate : undefined;
  if (typeof vibrate !== 'function') {
    return;
  }
  try {
    vibrate(VIBRATE_PATTERN[kind]);
  } catch (_error) {
    // Ignore unsupported vibration environments.
  }
};

