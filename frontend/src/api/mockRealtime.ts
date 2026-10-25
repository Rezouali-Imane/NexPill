import type { ConnectionState, ServerEvent } from '@/domain/types';
import type { RealtimeChannel } from './client';

const CHANNEL = 'nexpill-realtime';
type Frame = { patientId: string; event: ServerEvent };

/**
 * Simulated WebSocket. Frames published here reach this tab after a short latency and are
 * broadcast to other tabs via BroadcastChannel, so a patient tab and a caregiver tab
 * (signed in separately) see each other's changes live — exactly what a real socket would do.
 */
class MockRealtime implements RealtimeChannel {
  private handlers = new Set<(e: ServerEvent, patientId: string) => void>();
  private stateHandlers = new Set<(s: ConnectionState) => void>();
  private bc: BroadcastChannel | null = null;
  private state: ConnectionState = 'closed';
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private users = 0;

  connect() {
    this.users += 1;
    if (this.state === 'open' || this.state === 'connecting') return;
    this.setState('connecting');
    this.later(300, () => {
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel(CHANNEL);
        this.bc.onmessage = (m: MessageEvent<Frame>) => this.dispatch(m.data);
      }
      this.setState('open');
    });
  }

  disconnect() {
    this.users = Math.max(0, this.users - 1);
    if (this.users > 0) return;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.bc?.close();
    this.bc = null;
    this.setState('closed');
  }

  subscribe(h: (e: ServerEvent, patientId: string) => void) {
    this.handlers.add(h);
    return () => void this.handlers.delete(h);
  }

  onState(h: (s: ConnectionState) => void) {
    this.stateHandlers.add(h);
    h(this.state);
    return () => void this.stateHandlers.delete(h);
  }

  /** Called by the mock server in place of the real server pushing a frame. */
  publish(patientId: string, event: ServerEvent, latencyMs = 120) {
    const frame: Frame = { patientId, event };
    this.later(latencyMs, () => {
      this.dispatch(frame);
      try { this.bc ??= typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; this.bc?.postMessage(frame); } catch { /* ignore */ }
    });
  }

  /** Demo helper: drop and restore the connection. */
  simulateDrop(downMs = 2500) {
    if (this.state !== 'open') return;
    this.setState('reconnecting');
    this.later(downMs, () => this.setState('open'));
  }

  private dispatch(f: Frame) { this.handlers.forEach((h) => h(f.event, f.patientId)); }
  private setState(s: ConnectionState) { this.state = s; this.stateHandlers.forEach((h) => h(s)); }
  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }
}

export const mockRealtime = new MockRealtime();
