/**
 * Every number the director uses, in one place (P04-T14). Building numbers
 * (cars, capacity, door timing) come from `building.json`, not from here.
 *
 * "Visual seconds" are the director's own clock: real seconds × moveFactor.
 */
export const TUNING = {
  tickSeconds: 0.1,
  maxTicksPerFrame: 5,

  /** 00-overview §7: walk speed 1.3 m/s. */
  walkSpeed: 1.3,
  /** Steering speed for short unplanned moves (queue shuffles, boarding). */
  shuffleSpeed: 1.6,
  turnRate: 9,

  sitSeconds: 0.4,
  fadeSeconds: 0.3,
  dropWaitSeconds: 1,
  askChatSeconds: 3,
  pickSeconds: 0.35,

  /** Sim-speed → movement factor anchors (rate, factor), log-interpolated. */
  moveFactorAnchors: [
    [1, 1],
    [30, 1.6],
    [120, 3],
  ] as ReadonlyArray<readonly [number, number]>,

  catchUp: {
    /** ≥ this many queued errands → fast-forward. */
    mildBacklog: 2,
    mildFactor: 3,
    /** ≥ this many, or the oldest older than `staleSimMinutes` → heavy rule. */
    heavyBacklog: 4,
    heavyFactor: 6,
    staleSimMinutes: 20,
    /** Hard ceiling (R: backlog never > 6). */
    maxBacklog: 6,
  },

  idle: {
    stayAtDesk: 0.35,
    wander: 0.4,
    leisure: 0.25,
    dwellSimMinutes: [20, 90] as readonly [number, number],
    /** Dwell also ends after this many visual seconds per sim minute, so 1× is not frozen. */
    visualSecondsPerSimMinute: 3.2,
    /** At most this share of a department on a leisure floor at once. */
    maxDeptAwayShare: 0.3,
    /** People do not all stand up in the same tick. */
    startJitterSeconds: 9,
    firstDwellScale: 0.5,
    /** P05: a chatting pair takes turns showing the speech bubble. */
    talkTurnSeconds: 2.5,
  },

  separation: {
    radius: 0.55,
    maxOffset: 0.28,
    gain: 2.4,
    decay: 3,
  },

  elevator: {
    /** Where a caller waits before a car is assigned, west of the doors (m). */
    lobbyInset: 0.9,
    queueSpacing: 0.55,
    queueLane: 0.55,
    /** Car centre east of the door line (m). */
    carInset: 0.95,
    riderSpread: 0.32,
  },

  /** Chair distance from the desk centre per workspace slot type (blockoutSpec). */
  chairOffset: {
    desk: 0.55,
    review_desk: 0.58,
    private_office: 0.65,
    manager_office: 0.68,
    boss_desk: 0.72,
  } as Readonly<Record<string, number>>,
} as const

/** Real-time movement factor for a feed clock running at `clockRate`× (0 = paused). */
export function moveFactor(clockRate: number): number {
  if (!(clockRate > 0)) return 0
  const anchors = TUNING.moveFactorAnchors
  const first = anchors[0]!
  const last = anchors[anchors.length - 1]!
  if (clockRate <= first[0]) return first[1]
  if (clockRate >= last[0]) return last[1]
  for (let i = 1; i < anchors.length; i += 1) {
    const a = anchors[i - 1]!
    const b = anchors[i]!
    if (clockRate <= b[0]) {
      const t = (Math.log(clockRate) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]))
      return a[1] + (b[1] - a[1]) * t
    }
  }
  return last[1]
}
