/** A zero-second transition starts the prepared track after the old one ends. */
export const DEFAULT_CROSSFADE_SECONDS = 4;

export interface AudioTransitionSettings {
  /** Seconds of overlap; use 0 for a gapless handoff. */
  durationSeconds: number;
}

export interface AudioTransitionController {
  readonly active: boolean;
  /** Resolves true on handoff, false when canceled. Rejects if the new audio cannot play. */
  transition(
    outgoing: HTMLAudioElement,
    incoming: HTMLAudioElement,
    settings: AudioTransitionSettings
  ): Promise<boolean>;
  /** Keep the ramp in sync with the player's volume and mute controls. */
  setOutput(volume: number, muted: boolean): void;
  /** Stop a pending or running handoff and keep the outgoing track at full output. */
  cancel(): void;
  dispose(): void;
}

interface RunningTransition {
  outgoing: HTMLAudioElement;
  incoming: HTMLAudioElement;
  incomingVolume: number;
  incomingMuted: boolean;
  durationSeconds: number;
  progress: number;
  timer: ReturnType<typeof setInterval> | null;
  outgoingEnded: boolean;
  incomingReady: boolean;
  incomingStarted: boolean;
  incomingPlaying: boolean;
  onEnded: () => void;
  onReady: () => void;
  onError: () => void;
  resolve: (completed: boolean) => void;
  reject: (error: unknown) => void;
}

function assertDuration(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError("Crossfade duration must be a finite, non-negative number of seconds");
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Volume must be finite");
  return Math.max(0, Math.min(1, value));
}

/** Kept for callers that want to decide whether a prepared transition may begin. */
export function shouldStartAudioTransition(audio: HTMLAudioElement, durationSeconds: number): boolean {
  assertDuration(durationSeconds);
  return durationSeconds > 0 && !audio.paused && !audio.ended && !audio.seeking &&
    Number.isFinite(audio.duration) && audio.duration > 0 &&
    Number.isFinite(audio.currentTime) &&
    audio.duration - audio.currentTime > 0 &&
    audio.duration - audio.currentTime <= durationSeconds;
}

/**
 * Crossfade two independently loaded HTMLAudioElements. The incoming element is
 * not played until it is ready. A zero-duration transition waits for the outgoing
 * element's ended event, so gapless mode never truncates the old track early.
 */
export function createAudioTransitionController(initialVolume = 0.85, initialMuted = false): AudioTransitionController {
  let volume = clampVolume(initialVolume);
  let muted = initialMuted;
  let active: RunningTransition | null = null;
  let disposed = false;

  function applyLevels(transition: RunningTransition): void {
    transition.outgoing.volume = volume * (1 - transition.progress);
    transition.incoming.volume = volume * transition.progress;
    transition.outgoing.muted = muted;
    transition.incoming.muted = muted;
  }

  function settle(completed: boolean, failure?: { error: unknown }): void {
    const transition = active;
    if (!transition) return;
    active = null;
    if (transition.timer !== null) clearInterval(transition.timer);
    transition.outgoing.removeEventListener("ended", transition.onEnded);
    transition.incoming.removeEventListener("canplay", transition.onReady);
    transition.incoming.removeEventListener("loadeddata", transition.onReady);
    transition.incoming.removeEventListener("error", transition.onError);

    if (completed) {
      transition.outgoing.pause();
      transition.incoming.volume = volume;
      transition.incoming.muted = muted;
    } else {
      transition.incoming.pause();
      transition.incoming.volume = transition.incomingVolume;
      transition.incoming.muted = transition.incomingMuted;
    }
    transition.outgoing.volume = volume;
    transition.outgoing.muted = muted;
    if (failure) transition.reject(failure.error);
    else transition.resolve(completed);
  }

  return {
    get active() { return active !== null; },

    transition(outgoing, incoming, { durationSeconds }) {
      if (disposed) return Promise.reject(new Error("Audio transition controller has been disposed"));
      assertDuration(durationSeconds);
      if (outgoing === incoming) return Promise.reject(new Error("A transition requires two audio elements"));
      settle(false);

      return new Promise<boolean>((resolve, reject) => {
        const transition: RunningTransition = {
          outgoing,
          incoming,
          incomingVolume: incoming.volume,
          incomingMuted: incoming.muted,
          durationSeconds,
          progress: durationSeconds === 0 ? 1 : 0,
          timer: null,
          outgoingEnded: outgoing.ended,
          incomingReady: incoming.readyState >= 3,
          incomingStarted: false,
          incomingPlaying: false,
          onEnded: () => {
            if (active !== transition) return;
            transition.outgoingEnded = true;
            if (transition.incomingPlaying) {
              settle(true);
            } else {
              maybeStart();
            }
          },
          onReady: () => {
            if (active !== transition) return;
            transition.incomingReady = true;
            maybeStart();
          },
          onError: () => {
            if (active === transition) settle(false, { error: new Error("Incoming audio could not be loaded") });
          },
          resolve,
          reject,
        };
        active = transition;
        applyLevels(transition);

        const maybeStart = () => {
          if (active !== transition || transition.incomingStarted || !transition.incomingReady) return;
          if (durationSeconds === 0 && !transition.outgoingEnded) return;
          transition.incomingStarted = true;
          let playResult: Promise<void>;
          try {
            playResult = incoming.play();
          } catch (error) {
            settle(false, { error });
            return;
          }
          void playResult.then(() => {
            if (active !== transition) {
              incoming.pause();
              return;
            }
            transition.incomingPlaying = true;
            if (durationSeconds === 0 || transition.outgoingEnded) {
              settle(true);
              return;
            }
            const started = performance.now();
            transition.outgoing.addEventListener("ended", transition.onEnded);
            transition.timer = setInterval(() => {
              if (active !== transition) return;
              transition.progress = Math.min(1, (performance.now() - started) / (durationSeconds * 1000));
              applyLevels(transition);
              if (transition.progress >= 1) settle(true);
            }, 40);
          }).catch((error: unknown) => {
            if (active === transition) settle(false, { error });
          });
        };

        if (!transition.incomingReady) {
          incoming.addEventListener("canplay", transition.onReady);
          incoming.addEventListener("loadeddata", transition.onReady);
          incoming.addEventListener("error", transition.onError);
        }
        outgoing.addEventListener("ended", transition.onEnded);
        maybeStart();
      });
    },

    setOutput(nextVolume, nextMuted) {
      volume = clampVolume(nextVolume);
      muted = nextMuted;
      if (active) applyLevels(active);
    },

    cancel() { settle(false); },

    dispose() {
      settle(false);
      disposed = true;
    },
  };
}
