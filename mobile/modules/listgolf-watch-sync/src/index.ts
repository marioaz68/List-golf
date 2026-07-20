import { EventEmitter, requireNativeModule, Platform } from "expo-modules-core";

export type WatchOutboundEvent =
  | {
      type: "position";
      lat: number;
      lon: number;
      accuracy?: number | null;
      ts: number;
    }
  | {
      type: "swing";
      lat: number;
      lon: number;
      swingNo: number;
      ts: number;
      backswing_velocity_dps?: number;
      forwardswing_velocity_dps?: number;
      backswing_club_deg?: number;
      forward_club_deg?: number;
    }
  | { type: "round_started"; ts: number }
  | { type: "round_ended"; ts: number };

export interface WatchPhoneStatus {
  reachable: boolean;
  paired: boolean;
  watchAppInstalled: boolean;
}

type NativeModule = {
  activate(): void;
  pushAuthToWatch(displayName: string | null): void;
  getPhoneStatus(): WatchPhoneStatus;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const Native = Platform.OS === "ios"
  ? (requireNativeModule<NativeModule>("ListgolfWatchSync"))
  : null;

const emitter = Native ? new EventEmitter(Native) : null;

export function isWatchSyncAvailable(): boolean {
  return Platform.OS === "ios" && Native != null;
}

export function activateWatchSync(): void {
  Native?.activate();
}

export function pushAuthToWatch(displayName: string | null): void {
  Native?.pushAuthToWatch(displayName ?? null);
}

export function getWatchPhoneStatus(): WatchPhoneStatus {
  if (!Native) {
    return { reachable: false, paired: false, watchAppInstalled: false };
  }
  return Native.getPhoneStatus();
}

export function addWatchEventListener(
  listener: (event: WatchOutboundEvent) => void
): { remove: () => void } {
  if (!emitter) {
    return { remove: () => {} };
  }
  const sub = emitter.addListener<WatchOutboundEvent>(
    "onWatchEvent",
    listener
  );
  return { remove: () => sub.remove() };
}
