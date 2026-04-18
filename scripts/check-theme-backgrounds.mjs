import { chromium } from "playwright";
import zlib from "node:zlib";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const VIEWPORT = { width: 1440, height: 1024 };
const THEME_COOKIE_NAME = "chessview-theme";
const THEMES = [
  "midnight",
  "light",
  "solarized",
  "forest",
  "ocean",
  "crimson",
];
const ROUTES = [
  { key: "home", path: "/" },
  { key: "sign-in", path: "/sign-in" },
  { key: "sign-up", path: "/sign-up" },
  { key: "analysis", path: "/analysis" },
  { key: "account", path: "/account" },
];
const STABILITY_WAIT_MS = 1400;
const FLASH_TOLERANCE = 2;
const ROUTE_TOLERANCE = 4;

function parseCssColorAlpha(color) {
  const value = String(color || "").trim().toLowerCase();
  if (!value || value === "transparent") return 0;
  if (value.startsWith("rgba(")) {
    const parts = value
      .slice(5, -1)
      .split(",")
      .map((entry) => Number.parseFloat(entry.trim()));
    return Number.isFinite(parts[3]) ? parts[3] : 1;
  }
  if (value.startsWith("rgb(")) return 1;
  return 1;
}

function paethPredictor(left, up, upLeft) {
  const base = left + up - upLeft;
  const leftDelta = Math.abs(base - left);
  const upDelta = Math.abs(base - up);
  const upLeftDelta = Math.abs(base - upLeft);
  if (leftDelta <= upDelta && leftDelta <= upLeftDelta) return left;
  if (upDelta <= upLeftDelta) return up;
  return upLeft;
}

function readPixelFromPng(buffer) {
  const signature = buffer.subarray(0, 8);
  const expectedSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!signature.equals(expectedSignature)) {
    throw new Error("Unexpected PNG signature.");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  let offset = 8;

  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    offset += 12 + chunkLength;

    if (chunkType === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
  }

  if (width !== 1 || height !== 1) {
    throw new Error(`Expected a 1x1 PNG clip, received ${width}x${height}.`);
  }
  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${bitDepth}.`);
  }

  const channelsByType = {
    2: 3,
    6: 4,
  };
  const channels = channelsByType[colorType];
  if (!channels) {
    throw new Error(`Unsupported PNG color type: ${colorType}.`);
  }

  const bytesPerPixel = channels;
  const stride = width * bytesPerPixel;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const filterType = raw[0];
  const current = Buffer.from(raw.subarray(1, 1 + stride));
  const previous = Buffer.alloc(stride);

  for (let index = 0; index < stride; index += 1) {
    const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
    const up = previous[index];
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    switch (filterType) {
      case 0:
        break;
      case 1:
        current[index] = (current[index] + left) & 0xff;
        break;
      case 2:
        current[index] = (current[index] + up) & 0xff;
        break;
      case 3:
        current[index] = (current[index] + Math.floor((left + up) / 2)) & 0xff;
        break;
      case 4:
        current[index] =
          (current[index] + paethPredictor(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error(`Unsupported PNG filter type: ${filterType}.`);
    }
  }

  return {
    r: current[0],
    g: current[1],
    b: current[2],
    a: channels === 4 ? current[3] : 255,
  };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function maxChannelDelta(a, b) {
  return Math.max(
    Math.abs(a.r - b.r),
    Math.abs(a.g - b.g),
    Math.abs(a.b - b.b),
    Math.abs(a.a - b.a),
  );
}

async function sampleTransparentEdgePoint(page) {
  return page.evaluate(() => {
    const candidates = [
      { x: window.innerWidth - 8, y: window.innerHeight - 8, label: "bottom-right-8" },
      { x: window.innerWidth - 24, y: window.innerHeight - 8, label: "bottom-right-24x8" },
      { x: window.innerWidth - 8, y: window.innerHeight - 24, label: "bottom-right-8x24" },
      { x: 8, y: window.innerHeight - 8, label: "bottom-left-8" },
      { x: Math.floor(window.innerWidth / 2), y: window.innerHeight - 8, label: "bottom-center-8" },
    ];

    const isTransparentElement = (element) => {
      let current = element;
      while (current && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        const alpha = (() => {
          const color = String(style.backgroundColor || "").trim().toLowerCase();
          if (!color || color === "transparent") return 0;
          if (color.startsWith("rgba(")) {
            const parts = color
              .slice(5, -1)
              .split(",")
              .map((entry) => Number.parseFloat(entry.trim()));
            return Number.isFinite(parts[3]) ? parts[3] : 1;
          }
          if (color.startsWith("rgb(")) return 1;
          return 1;
        })();
        if (alpha > 0.04) return false;
        if (style.backgroundImage && style.backgroundImage !== "none") return false;
        current = current.parentElement;
      }
      return true;
    };

    for (const candidate of candidates) {
      const target = document.elementFromPoint(candidate.x, candidate.y);
      if (!target) continue;
      const tag = target.tagName.toLowerCase();
      if (tag === "html" || tag === "body" || isTransparentElement(target)) {
        return {
          ...candidate,
          tag,
          className: String(target.className || ""),
        };
      }
    }

    throw new Error("Could not find a transparent edge pixel to sample.");
  });
}

async function samplePixel(page, point) {
  const clip = {
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
  };
  const screenshot = await page.screenshot({ clip, type: "png" });
  return readPixelFromPng(screenshot);
}

function summarizeRecord(record) {
  return `${record.theme} ${record.route} @ ${record.point.label} (${record.point.x},${record.point.y}) ${toHex(record.settled)} initial=${toHex(record.initial)} final=${toHex(record.settled)} ${record.finalUrl}`;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];

  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      await context.addCookies([
        {
          name: THEME_COOKIE_NAME,
          value: theme,
          url: BASE_URL,
        },
      ]);

      const records = [];
      for (const route of ROUTES) {
        const page = await context.newPage();
        await page.goto(`${BASE_URL}${route.path}`, {
          waitUntil: "domcontentloaded",
        });

        const point = await sampleTransparentEdgePoint(page);
        const initial = await samplePixel(page, point);
        await page.waitForTimeout(STABILITY_WAIT_MS);
        const settled = await samplePixel(page, point);

        records.push({
          theme,
          route: route.path,
          finalUrl: page.url(),
          point,
          initial,
          settled,
        });

        const flashDelta = maxChannelDelta(initial, settled);
        if (flashDelta > FLASH_TOLERANCE) {
          failures.push(
            `Theme flash detected on ${route.path} for ${theme}: ${toHex(initial)} -> ${toHex(settled)} (delta ${flashDelta})`,
          );
        }

        await page.close();
      }

      const baseline = records[0];
      for (const record of records.slice(1)) {
        const delta = maxChannelDelta(baseline.settled, record.settled);
        if (delta > ROUTE_TOLERANCE) {
          failures.push(
            `Background mismatch for ${theme}: ${baseline.route} ${toHex(baseline.settled)} vs ${record.route} ${toHex(record.settled)} (delta ${delta})`,
          );
        }
      }

      for (const record of records) {
        console.log(summarizeRecord(record));
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error("\nTheme background check failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log("\nTheme background check passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
