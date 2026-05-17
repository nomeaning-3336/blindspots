"use client";

import {
  playSnapshotShutterSound,
  prepareSnapshotAudio,
} from "@/lib/train-audio";

type PlayBoardSnapshotToButtonInput = {
  boardEl: HTMLElement | null;
  buttonEl: HTMLElement | null;
  onLanded?: () => void;
};

const SHUTTER_FLASH_MS = 120;
const PHOTO_HOLD_MS = 80;
const PHOTO_FLY_MS = 400;
const BUTTON_REACTION_LEAD_MS = 80;

export async function playBoardSnapshotToButton({
  boardEl,
  buttonEl,
  onLanded,
}: PlayBoardSnapshotToButtonInput): Promise<void> {
  if (!boardEl || !buttonEl || prefersReducedMotion()) {
    onLanded?.();
    return;
  }

  const boardRect = boardEl.getBoundingClientRect();
  const buttonRect = buttonEl.getBoundingClientRect();

  if (boardRect.width <= 0 || boardRect.height <= 0) {
    onLanded?.();
    return;
  }

  const flash = document.createElement("div");
  flash.setAttribute("data-board-snapshot-flash", "true");
  Object.assign(flash.style, {
    position: "fixed",
    left: `${boardRect.left}px`,
    top: `${boardRect.top}px`,
    width: `${boardRect.width}px`,
    height: `${boardRect.height}px`,
    background: "white",
    opacity: "0.85",
    pointerEvents: "none",
    zIndex: "2147483645",
  });

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-board-snapshot-clone", "true");
  Object.assign(wrapper.style, {
    position: "fixed",
    left: `${boardRect.left}px`,
    top: `${boardRect.top}px`,
    width: `${boardRect.width}px`,
    height: `${boardRect.height}px`,
    boxSizing: "border-box",
    border: "6px solid white",
    borderBottomWidth: "10px",
    borderRadius: "4px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    contain: "paint",
    overflow: "hidden",
    pointerEvents: "none",
    transformOrigin: "center center",
    zIndex: "2147483644",
  });

  const clone = boardEl.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  Object.assign(clone.style, {
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    contain: "paint",
  });
  wrapper.appendChild(clone);

  await prepareSnapshotAudio().catch(() => {});

  document.body.appendChild(wrapper);
  document.body.appendChild(flash);

  try {
    playSnapshotShutterSound();

    await flash
      .animate(
        [
          { opacity: 0.85 },
          { opacity: 0 },
        ],
        { duration: SHUTTER_FLASH_MS, easing: "ease-out", fill: "forwards" },
      )
      .finished.catch(() => {});
    flash.remove();

    await wait(PHOTO_HOLD_MS);

    const boardCenterX = boardRect.left + boardRect.width / 2;
    const boardCenterY = boardRect.top + boardRect.height / 2;
    const targetCenter = clampedTargetCenter(boardRect, buttonRect);
    const dx = targetCenter.x - boardCenterX;
    const dy = targetCenter.y - boardCenterY;
    const rawScale = Math.min(
      buttonRect.width / boardRect.width,
      buttonRect.height / boardRect.height,
    ) * 0.9;
    const finalScale = Math.min(0.15, Math.max(0.08, rawScale || 0.15));

    const reactionTimer = window.setTimeout(() => {
      buttonEl.classList.remove("train-add-position-chest-absorb");
      void buttonEl.offsetWidth;
      buttonEl.classList.add("train-add-position-chest-absorb");
      window.setTimeout(() => {
        buttonEl.classList.remove("train-add-position-chest-absorb");
      }, 220);
    }, Math.max(0, PHOTO_FLY_MS - BUTTON_REACTION_LEAD_MS));

    await wrapper.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        {
          transform: `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(${finalScale * 1.3})`,
          opacity: 1,
          offset: 0.7,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${finalScale})`, opacity: 0 },
      ],
      {
        duration: PHOTO_FLY_MS,
        easing: "cubic-bezier(0.55, -0.05, 0.85, 0.4)",
        fill: "forwards",
      },
    )
      .finished.catch(() => {});

    window.clearTimeout(reactionTimer);
    onLanded?.();
  } finally {
    flash.remove();
    wrapper.remove();
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clampedTargetCenter(boardRect: DOMRect, buttonRect: DOMRect) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const halfWidth = Math.max(12, boardRect.width * 0.075);
  const halfHeight = Math.max(12, boardRect.height * 0.075);
  const rawX = buttonRect.left + buttonRect.width / 2;
  const rawY = buttonRect.top + buttonRect.height / 2;

  return {
    x: Math.min(viewportWidth - halfWidth, Math.max(halfWidth, rawX)),
    y: Math.min(viewportHeight - halfHeight, Math.max(halfHeight, rawY)),
  };
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
