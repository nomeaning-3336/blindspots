import { chromium } from "@playwright/test";

const INIT_SKIPPED = {
  profile: {
    initialization_status: "skipped",
    profile_initialized: false,
    weakness_vector: {},
    mastery_vector: {},
    exploit_queue: [],
    explore_queue: [],
    revisit_queue: [],
    mastered_queue: [],
  },
  preferences: { sequence_length: 4 },
  linkedProfiles: [],
  shouldShowOnboarding: false,
};

const MOCK_PAYLOAD = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
  source: "elite",
};

async function addAuthCookies(page) {
  const { readFileSync } = await import("node:fs");
  const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
  await page.context().addCookies(cookies);
}

async function waitForBoardVisible(page) {
  const board = page.locator("[data-testid='train-board']");
  await board.waitFor({ state: "visible", timeout: 10000 });
  return board;
}

async function getDraggedPieceInfo(page) {
  return page.evaluate(() => {
    // Find the DraggedPiece element
    const imgs = document.querySelectorAll("img[draggable='false']");
    const dragImg = Array.from(imgs).find(img =>
      img.style.position === "fixed" &&
      img.style.zIndex === "9999"
    );
    if (!dragImg) return null;

    const rect = dragImg.getBoundingClientRect();
    const parent = dragImg.parentElement;
    const parentRect = parent?.getBoundingClientRect();

    return {
      imgRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      parentRect: parentRect ? { left: parentRect.left, top: parentRect.top, width: parentRect.width, height: parentRect.height } : null,
      style: {
        position: imgImg => img.style.position,
        left: dragImg.style.left,
        top: dragImg.style.top,
        width: dragImg.style.width,
        height: dragImg.style.height,
        transform: dragImg.style.transform,
        zIndex: dragImg.style.zIndex,
      }
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await addAuthCookies(page);

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });
  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: MOCK_PAYLOAD });
  });

  await page.goto("http://localhost:3000/train");

  // Wait for board to be visible
  const board = await waitForBoardVisible(page);
  const boardBox = await board.boundingBox();
  console.log(`Board bounding box: x=${boardBox.x}, y=${boardBox.y}, w=${boardBox.width}, h=${boardBox.height}`);

  // Unlock audio overlay
  const overlay = page.locator("[data-testid='audio-unlock-overlay']");
  await overlay.click();
  await page.waitForTimeout(1500);

  // Calculate center of e4 square (from white perspective, e4 is column 4, row 2 from top)
  // Board is 8x8, columns left-to-right: a=0,b=1,...,h=7; rows top-to-bottom: 8=0,...,1=7
  // e4 = column 4, row 4 from top (0-indexed: col=4, row=3)
  const squareSize = boardBox.width / 8;
  // e4: file 'e' = 4th column (0-indexed=4), rank 4 = row index 3 (from white's perspective, rank 4 is 4th row from top)
  const e4Col = 4; // e file (0-indexed)
  const e4Row = 3; // 4th rank from white's view (0-indexed from top)
  const e4CenterX = boardBox.x + (e4Col + 0.5) * squareSize;
  const e4CenterY = boardBox.y + (e4Row + 0.5) * squareSize;

  console.log(`e4 center: (${e4CenterX}, ${e4CenterY}), squareSize=${squareSize}`);

  // Mouse down on e4 square
  await page.mouse.move(e4CenterX, e4CenterY);
  await page.waitForTimeout(200);

  // Get cursor position before drag
  const cursorX = e4CenterX;
  const cursorY = e4CenterY;

  // Mouse down
  await page.mouse.down();
  await page.waitForTimeout(300);

  // Get drag ghost info
  const dragInfo = await page.evaluate(({ cx, cy }) => {
    // Find all fixed elements with z-index 9999
    const allFixed = document.querySelectorAll("*");
    let dragEl = null;
    for (const el of allFixed) {
      const style = window.getComputedStyle(el);
      if (style.position === "fixed" && style.zIndex === "9999") {
        dragEl = el;
        break;
      }
    }
    if (!dragEl) return { found: false };

    const rect = dragEl.getBoundingClientRect();
    const style = window.getComputedStyle(dragEl);

    return {
      found: true,
      elTag: dragEl.tagName,
      elClasses: dragEl.className,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      style: {
        left: style.left,
        top: style.top,
        width: style.width,
        height: style.height,
        transform: style.transform,
      },
      cursorPos: { x: cx, y: cy },
      // Check centering: center of element vs cursor
      elementCenter: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      offset: { x: (rect.left + rect.width / 2) - cx, y: (rect.top + rect.height / 2) - cy }
    };
  }, { cx: cursorX, cy: cursorY });

  console.log("\n=== DRAG GHOST INFO ===");
  console.log(JSON.stringify(dragInfo, null, 2));

  if (dragInfo.found) {
    const offsetPixels = Math.sqrt(dragInfo.offset.x ** 2 + dragInfo.offset.y ** 2);
    console.log(`\nCentering offset: (${dragInfo.offset.x.toFixed(1)}px, ${dragInfo.offset.y.toFixed(1)}px) - magnitude: ${offsetPixels.toFixed(1)}px`);

    // Check if within tolerance (should be within 2px for centered)
    const tolerance = squareSize * 0.02; // 2% of square size
    if (Math.abs(dragInfo.offset.x) <= tolerance && Math.abs(dragInfo.offset.y) <= tolerance) {
      console.log("✓ PASS: Ghost is centered under cursor (within tolerance)");
    } else {
      console.log("✗ FAIL: Ghost is NOT centered - offset too large");
    }

    // Also check the wrapper div (parent)
    const wrapperInfo = await page.evaluate(() => {
      const allFixed = document.querySelectorAll("*");
      let dragEl = null;
      for (const el of allFixed) {
        const style = window.getComputedStyle(el);
        if (style.position === "fixed" && style.zIndex === "9999") {
          dragEl = el;
          break;
        }
      }
      const parent = dragEl.parentElement;
      if (!parent) return null;
      const parentRect = parent.getBoundingClientRect();
      const dragRect = dragEl.getBoundingClientRect();
      return {
        parentTag: parent.tagName,
        parentRect: { left: parentRect.left, top: parentRect.top, width: parentRect.width, height: parentRect.height },
        parentCursorOffset: { x: (parentRect.left + parentRect.width / 2) - (dragRect.left + dragRect.width / 2), y: 0 }
      };
    });
    if (wrapperInfo) {
      console.log("\nWrapper (full square):");
      console.log(JSON.stringify(wrapperInfo, null, 2));
    }
  } else {
    console.log("✗ No drag ghost element found");
  }

  await page.mouse.up();
  await browser.close();
}

main().catch(console.error);