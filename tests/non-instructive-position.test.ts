import { isNonInstructivePosition } from "../lib/training/non-instructive-position";
import { describe, it, expect } from "vitest";

describe("isNonInstructivePosition", () => {
  it("returns not non-instructive for neutral positions", () => {
    const result = isNonInstructivePosition({ evalCp: 0 });
    expect(result.isNonInstructive).toBe(false);
  });

  // ── Resignable / hopelessly lost ───────────────────────────────

  it("resignable: all lines hopeless with no spread", () => {
    const result = isNonInstructivePosition({
      engineLines: [{ cp: -950 }, { cp: -980 }, { cp: -1030 }, { cp: -900 }],
    });
    expect(result.isNonInstructive).toBe(true);
    expect(result.category).toBe("resignable");
  });

  it("resignable: forced mate against within threshold", () => {
    const result = isNonInstructivePosition({
      mate: -5,
      engineLines: [{ cp: 0, mate: -5 }, { cp: 0, mate: -7 }],
    });
    expect(result.isNonInstructive).toBe(true);
    expect(result.category).toBe("resignable");
  });

  it("not resignable: bad but meaningful spread", () => {
    const result = isNonInstructivePosition({
      engineLines: [{ cp: -650 }, { cp: -250 }, { cp: -900 }],
    });
    expect(result.isNonInstructive).toBe(false);
  });

  // ── Overwhelmingly winning ─────────────────────────────────────

  it("overwhelmingly winning: all lines crushing with no spread", () => {
    const result = isNonInstructivePosition({
      engineLines: [{ cp: 1050 }, { cp: 980 }, { cp: 920 }, { cp: 875 }],
    });
    expect(result.isNonInstructive).toBe(true);
    expect(result.category).toBe("overwhelmingly_winning");
  });

  it("not overly winning: winning but instructive with spread", () => {
    const result = isNonInstructivePosition({
      engineLines: [{ cp: 1100 }, { cp: 250 }, { cp: -50 }],
    });
    expect(result.isNonInstructive).toBe(false);
  });

  it("overwhelmingly winning: trivial mate for player", () => {
    const result = isNonInstructivePosition({
      mate: 3,
      engineLines: [{ mate: 3, cp: 0 }, { mate: 4, cp: 0 }, { cp: 900 }],
    });
    expect(result.isNonInstructive).toBe(true);
    expect(result.category).toBe("overwhelmingly_winning");
  });

  it("not overly winning: tactical mate puzzle where only one line mates", () => {
    const result = isNonInstructivePosition({
      mate: 4,
      engineLines: [{ mate: 4, cp: 0 }, { cp: 200 }, { cp: -50 }],
    });
    expect(result.isNonInstructive).toBe(false);
  });
});
