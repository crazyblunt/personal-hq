/**
 * Focus timer. The running state survives reloads on this device. A finished
 * work session is written to the activity log; nothing else is recorded.
 */
import { create } from 'zustand';
import { logFocusSession, useHQ } from '../data/store';
import { readDevice, writeDevice } from './deviceStorage';
import { toast } from './ui';

export type FocusPhase = 'work' | 'break';

interface FocusState {
  phase: FocusPhase;
  running: boolean;
  /** Epoch ms when the running phase ends. */
  endsAt: number | null;
  /** Remaining time while paused. */
  remainingMs: number;
  taskId: string | null;
}

const minutes = (phase: FocusPhase) => {
  const s = useHQ.getState().settings;
  return phase === 'work' ? s.focusMinutes : s.breakMinutes;
};

const saved = readDevice<Partial<FocusState>>('focus', {});

export const useFocus = create<FocusState>(() => ({
  phase: saved.phase === 'break' ? 'break' : 'work',
  running: saved.running === true && typeof saved.endsAt === 'number',
  endsAt: typeof saved.endsAt === 'number' ? saved.endsAt : null,
  remainingMs: typeof saved.remainingMs === 'number' ? saved.remainingMs : 25 * 60_000,
  taskId: typeof saved.taskId === 'string' ? saved.taskId : null,
}));

useFocus.subscribe((s) => writeDevice('focus', s));

export function focusRemaining(s: FocusState, now = Date.now()): number {
  return s.running && s.endsAt ? Math.max(0, s.endsAt - now) : s.remainingMs;
}

export function startFocus() {
  const s = useFocus.getState();
  if (s.running) return;
  useFocus.setState({ running: true, endsAt: Date.now() + s.remainingMs });
}

export function pauseFocus() {
  const s = useFocus.getState();
  if (!s.running) return;
  useFocus.setState({ running: false, endsAt: null, remainingMs: focusRemaining(s) });
}

export function toggleFocus() {
  if (useFocus.getState().running) pauseFocus();
  else startFocus();
}

export function resetFocus(phase: FocusPhase = useFocus.getState().phase) {
  useFocus.setState({ phase, running: false, endsAt: null, remainingMs: minutes(phase) * 60_000 });
}

export function setFocusTask(taskId: string | null) {
  useFocus.setState({ taskId });
}

/** Called once a second by the app shell; finishes the phase when time is up. */
export function tickFocus(now = Date.now()) {
  const s = useFocus.getState();
  if (!s.running || !s.endsAt || now < s.endsAt) return;
  if (s.phase === 'work') {
    const mins = minutes('work');
    logFocusSession(mins, s.taskId);
    toast(`Focus session done: ${mins} min. Time for a break.`, 'info');
    beep();
    resetFocus('break');
  } else {
    toast('Break over. Ready for another focus session.', 'info');
    beep();
    resetFocus('work');
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => void ctx.close();
  } catch {
    /* sound is optional */
  }
}
