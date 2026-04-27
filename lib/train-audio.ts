// Train audio manager — single shared AudioContext, pre-decoded buffers, no hot-path waits.

export type TrainSoundName = "move" | "capture";

export type PlayTrainSoundOptions = {
  move: TrainSoundMove;
  pitchIndex?: number;
  advanceLivePitch?: boolean;
  plyRef?: { current: number };
  source?: "live" | "replay" | "initial-engine";
};

export type TrainSoundMove = {
  san?: unknown;
  captured?: unknown;
  flags?: unknown;
  uci?: unknown;
};

export type TrainAudioStats = {
  primeStartedAt: number;
  primeFinishedAt: number;
  unlockedAt: number;
  playCalls: number;
  startedCalls: number;
  skippedBufferMissing: number;
  skippedContextSuspended: number;
  averagePlaySetupMs: number;
  lastEvents: TrainAudioEvent[];
};

export type TrainAudioEvent = {
  san: unknown;
  uci: unknown;
  soundName: TrainSoundName;
  pitchIndex: number;
  scaleIndex: number;
  scaleLabel: string;
  playbackRate: number;
  source: "live" | "replay" | "initial-engine";
  requestedAt: number;
  startedAt: number;
  setupMs: number;
  contextState: string;
};

const TRAIN_SOUND_SOURCES: Record<TrainSoundName, string> = {
  move: "/analyze/sounds/move-self.mp3",
  capture: "/analyze/sounds/capture.mp3",
};

const MOVE_SCALE_RATIOS = [
  1.0, 1.12246, 1.25992, 1.33484, 1.49831, 1.68179, 1.88775, 2.0,
] as const;

const MOVE_SCALE_LABELS = ["do", "re", "mi", "fa", "sol", "la", "si", "do"] as const;

type TrainAudioManager = {
  _context: AudioContext | null;
  _buffers: Map<TrainSoundName, AudioBuffer>;
  _primePromise: Promise<void> | null;
  _primeStartedAt: number;
  _primeFinishedAt: number;
  _unlockedAt: number;
  _playCalls: number;
  _startedCalls: number;
  _skippedBufferMissing: number;
  _skippedContextSuspended: number;
  _totalSetupMs: number;
  _eventCount: number;
  _lastEvents: TrainAudioEvent[];
};

const _instance: TrainAudioManager = {
  _context: null,
  _buffers: new Map(),
  _primePromise: null,
  _primeStartedAt: 0,
  _primeFinishedAt: 0,
  _unlockedAt: 0,
  _playCalls: 0,
  _startedCalls: 0,
  _skippedBufferMissing: 0,
  _skippedContextSuspended: 0,
  _totalSetupMs: 0,
  _eventCount: 0,
  _lastEvents: [],
};

let _unlockListenersRegistered = false;

export const TRAIN_AUDIO_MANAGER = _instance;

export function pingPongScaleIndex(plyIndex: number): number {
  const maxIndex = MOVE_SCALE_RATIOS.length - 1;
  if (maxIndex <= 0) return 0;
  const period = maxIndex * 2;
  const normalized = ((plyIndex % period) + period) % period;
  return normalized <= maxIndex ? normalized : period - normalized;
}

export function pitchRatioForPly(plyIndex: number) {
  return MOVE_SCALE_RATIOS[pingPongScaleIndex(plyIndex)];
}

export function scaleLabelForPly(plyIndex: number): string {
  return MOVE_SCALE_LABELS[pingPongScaleIndex(plyIndex)];
}

export function primeTrainAudio(): Promise<void> {
  if (_instance._primePromise) return _instance._primePromise;

  const ctx = _getOrCreateContext();
  if (!ctx) return Promise.resolve();

  _instance._primeStartedAt = performance.now();

  _instance._primePromise = Promise.all(
    (Object.entries(TRAIN_SOUND_SOURCES) as Array<[TrainSoundName, string]>)
      .map(async ([name, src]) => {
        if (_instance._buffers.has(name)) return;
        const response = await fetch(src, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Could not load train sound: ${src}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await _decodeAudioBuffer(ctx, arrayBuffer);
        _instance._buffers.set(name, buffer);
      }),
  ).then(
    () => {
      _instance._primeFinishedAt = performance.now();
    },
    () => {
      _instance._primePromise = null;
    });

  return _instance._primePromise;
}

export function unlockTrainAudio(): Promise<void> {
  const ctx = _getOrCreateContext();
  if (!ctx) return Promise.resolve();

  if (ctx.state === "running") {
    _instance._unlockedAt = performance.now();
    void primeTrainAudio();
    return Promise.resolve();
  }

  const unlockPromise = ctx.resume();
  if (unlockPromise && typeof unlockPromise.then === "function") {
    return unlockPromise
      .then(() => {
        _instance._unlockedAt = performance.now();
        void primeTrainAudio();
      })
      .catch(() => {});
  }

  _instance._unlockedAt = performance.now();
  void primeTrainAudio();
  return Promise.resolve();
}

export function playTrainMoveSound(options: PlayTrainSoundOptions): boolean {
  const { move, pitchIndex, advanceLivePitch = true, plyRef, source } = options;

  _instance._playCalls += 1;
  const requestedAt = performance.now();

  const ctx = _getOrCreateContext();
  if (!ctx) return false;

  const isCapture = _moveIsCapture(move);
  const soundName: TrainSoundName = isCapture ? "capture" : "move";
  const buffer = _instance._buffers.get(soundName);

  if (!buffer) {
    _instance._skippedBufferMissing += 1;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[train-audio] buffer missing for "${soundName}", sound skipped`);
    }
    return false;
  }

  if (ctx.state === "suspended") {
    _instance._skippedContextSuspended += 1;
    void ctx.resume().catch(() => {});
    return false;
  }

  if (ctx.state !== "running") {
    return false;
  }

  const effectivePitchIndex = pitchIndex ?? plyRef?.current ?? 0;
  const scaleIdx = pingPongScaleIndex(effectivePitchIndex);
  const playbackRate = pitchRatioForPly(effectivePitchIndex);
  const startedAt = performance.now();
  const setupMs = startedAt - requestedAt;

  _instance._startedCalls += 1;
  _instance._totalSetupMs += setupMs;
  _instance._eventCount += 1;

  const event: TrainAudioEvent = {
    san: typeof move.san === "string" ? move.san : undefined,
    uci: typeof move.uci === "string" ? move.uci : undefined,
    soundName,
    pitchIndex: effectivePitchIndex,
    scaleIndex: scaleIdx,
    scaleLabel: MOVE_SCALE_LABELS[scaleIdx],
    playbackRate,
    source: source ?? "live",
    requestedAt,
    startedAt,
    setupMs,
    contextState: ctx.state,
  };
  _instance._lastEvents.push(event);
  if (_instance._lastEvents.length > 20) _instance._lastEvents.shift();

  // QA instrumentation — push to window global if present
  if (typeof window !== "undefined") {
    const win = window as unknown as {
      __blindspotsTrainSoundEvents?: TrainAudioEvent[];
      __blindspotsTrainAudioStats?: TrainAudioStats;
    };
    if (Array.isArray(win.__blindspotsTrainSoundEvents)) {
      win.__blindspotsTrainSoundEvents.push(event);
    }
    if (win.__blindspotsTrainAudioStats) {
      win.__blindspotsTrainAudioStats.lastEvents = _instance._lastEvents;
    }
  }

  try {
    const gainNode = ctx.createGain();
    gainNode.gain.value = isCapture ? 1.0 : 0.85;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = playbackRate;
    node.connect(gainNode);
    gainNode.connect(ctx.destination);
    node.start();
  } catch {
    return false;
  }

  if (advanceLivePitch && plyRef) {
    plyRef.current += 1;
  }

  return true;
}

export function getTrainAudioStats(): TrainAudioStats {
  return {
    primeStartedAt: _instance._primeStartedAt,
    primeFinishedAt: _instance._primeFinishedAt,
    unlockedAt: _instance._unlockedAt,
    playCalls: _instance._playCalls,
    startedCalls: _instance._startedCalls,
    skippedBufferMissing: _instance._skippedBufferMissing,
    skippedContextSuspended: _instance._skippedContextSuspended,
    averagePlaySetupMs: _instance._eventCount > 0 ? _instance._totalSetupMs / _instance._eventCount : 0,
    lastEvents: [..._instance._lastEvents],
  };
}

function _getOrCreateContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_instance._context) return _instance._context;

  const AudioCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;

  try {
    _instance._context = new AudioCtor();
  } catch {
    _instance._context = null;
  }

  return _instance._context;
}

function _decodeAudioBuffer(ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const data = arrayBuffer.slice(0);
  return new Promise<AudioBuffer>((resolve, reject) => {
    const maybePromise = ctx.decodeAudioData(data, resolve, reject);
    if (maybePromise instanceof Promise) {
      maybePromise.then(resolve, reject);
    }
  });
}

function _moveIsCapture(move?: TrainSoundMove | null): boolean {
  if (!move) return false;
  if (move.captured) return true;
  if (typeof move.flags === "string" && /[ce]/.test(move.flags)) return true;
  return typeof move.san === "string" && move.san.includes("x");
}

export function setupTrainAudioUnlockOnGesture(): void {
  if (_unlockListenersRegistered || typeof window === "undefined") return;
  _unlockListenersRegistered = true;

  const unlock = () => {
    void unlockTrainAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}