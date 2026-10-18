/** Shared UI pieces: embers, toasts, sheets and tags. */

import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";


const EMBER_COLORS = ["#ffb35c", "#ffd38a", "#ff8a5c", "#f0c97a", "#ffe6b0"];

/** Warm embers drifting up from the bottom of the screen. Change `burstKey` to fire again. */
export function Embers({ burstKey, reducedMotion }: { burstKey: number; reducedMotion: boolean }) {
  const embers = useMemo(() => {
    const count = reducedMotion ? 8 : 38;
    return Array.from({ length: count }, (_, index) => ({
      id: `${burstKey}-${index}`,
      left: 6 + Math.random() * 88,
      delay: Math.random() * 0.8,
      duration: 2.4 + Math.random() * 1.8,
      drift: (Math.random() - 0.5) * 120,
      size: 3 + Math.random() * 5,
      color: EMBER_COLORS[index % EMBER_COLORS.length],
    }));
  }, [burstKey, reducedMotion]);
  if (burstKey === 0) return null;
  return (
    <div className="embers" aria-hidden="true" key={burstKey}>
      <div className="embers-glow" />
      {embers.map((ember) => (
        <span
          key={ember.id}
          className="ember"
          style={
            {
              left: `${ember.left}%`,
              width: ember.size,
              height: ember.size,
              color: ember.color,
              animationDelay: `${ember.delay}s`,
              animationDuration: `${ember.duration}s`,
              "--drift": `${ember.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export interface ToastMessage {
  id: number;
  text: string;
  icon?: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button type="button" key={toast.id} className="toast card" onClick={() => onDismiss(toast.id)}>
          {toast.icon && <span className="toast-icon">{toast.icon}</span>}
          <span>{toast.text}</span>
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
  className = "",
}: {
  title?: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        {onClose && (
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
