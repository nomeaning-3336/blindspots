import { isResignablePosition } from "../lib/training/resignable-position";
import { describe, it, expect } from "vitest";

describe("isResignablePosition", () => {
  it("returns not resignable for neutral positions", () => {
    const result = isResignablePosition({ evalCp: 0 });
    expect(result.isResignable).toBe(false);
  });

  it("returns not resignable for slightly losing positions", () => {
    const result = isResignablePosition({ evalCp: -300, sideToMove: "white" });
    expect(result.isResignable).toBe(false);
  });

  it("returns not resignable for positions with meaningful decision spread", () => {
    const result = isResignablePosition({
      evalCp: -600,
      sideToMove: "white",
      engineLines: [{ cp: -450 }, { cp: -250 }, { cp: -600 }],
    });
    expect(result.isResignable).toBe(false);
  });

  it("marks as resignable: forced mate against within threshold", () => {
    const result = isResignablePosition({
      mate: -5,
      sideToMove: "white",
      engineLines: [{ cp: 0, mate: -5 }, { cp: 0, mate: -7 }],
    });
    expect(result.isResignable).toBe(true);
  });

  it("does not mark as resignable: mate available for side to move", () => {
    const result = isResignablePosition({
      mate: 3,
      sideToMove: "white",
      engineLines: [{ cp: 0, mate: 3 }],
    });
    expect(result.isResignable).toBe(false);
  });

  it("marks as resignable: crushing eval with no spread", () => {
    const result = isResignablePosition({
      sideToMove: "white",
      engineLines: [
        { cp: -950 },
        { cp: -980 },
        { cp: -1000 },
        { cp: -1050 },
      ],
    });
    expect(result.isResignable).toBe(true);
  });

  it("does not mark as resignable: bad but with spread", () => {
    const result = isResignablePosition({
      sideToMove: "white",
      engineLines: [
        { cp: -650 },
        { cp: -400 },
        { cp: -850 },
      ],
    });
    expect(result.isResignable).toBe(false);
  });
});
