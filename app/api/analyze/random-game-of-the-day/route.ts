import { NextResponse } from "next/server";

interface GameOfTheDay {
  gid: string;
  title: string;
  players: string;
  pgn: string;
  date: string;
}

function getMonthAbbr(month: number): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[month];
}

function formatDateForChessgames(date: Date): string {
  const month = getMonthAbbr(date.getMonth());
  const day = date.getDate().toString().padStart(2, "0");
  return `${month}-${day}`;
}

function formatDateForDisplay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatPgnDateForDisplay(value?: string | null): string | null {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}|\?{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/);
  if (!match) return null;

  const [, yearToken, monthToken, dayToken] = match;
  if (!/^\d{4}$/.test(yearToken)) return null;

  const year = yearToken;
  const month = /^\d{2}$/.test(monthToken) ? Number(monthToken) : NaN;
  const day = /^\d{2}$/.test(dayToken) ? Number(dayToken) : NaN;
  const hasMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  const hasDay = Number.isInteger(day) && day >= 1 && day <= 31;

  if (hasMonth && hasDay) {
    return `${getMonthAbbr(month - 1)} ${day}, ${year}`;
  }

  if (hasMonth) {
    return `${getMonthAbbr(month - 1)} ${year}`;
  }

  return year;
}

export async function GET() {
  try {
    const today = new Date();
    const dateStr = formatDateForChessgames(today);

    // Fetch the games of the day page to find the game gid for today
    const gamesOfTheDayUrl = `https://www.chessgames.com/perl/gamesoftheday`;
    const response = await fetch(gamesOfTheDayUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch games of the day page: ${response.status}`);
    }

    const html = await response.text();

    // Look for the game link pattern in the HTML
    // The gid is typically found in links like /perl/chessgame?gid=1752353
    // We need to find today's game - the page shows multiple games, we want the one matching today's date

    // Try to find gid from the page - look for patterns like gid=XXXXXXX
    // The page structure may vary, so we need to be flexible

    // First, let's try a direct approach: use a known gid for today if available
    // Otherwise, look for the gid in the page

    // Look for the date header and subsequent gid
    // Pattern: find "Apr-11" (or current date) and then find the gid nearby

    const datePattern = new RegExp(`(${dateStr})[^]*?gid=(\\d+)`, "i");
    const dateMatch = html.match(datePattern);

    let gid: string;
    let title = "";
    let players = "";

    if (dateMatch) {
      gid = dateMatch[2];
    } else {
      // Fallback: try to find the first game gid in the page
      const gidMatch = html.match(/gid=(\d+)/);
      if (!gidMatch) {
        return NextResponse.json(
          { error: "Could not find game of the day" },
          { status: 404 }
        );
      }
      gid = gidMatch[1];
    }

    // Now fetch the PGN for this gid
    const pgnUrl = `https://www.chessgames.com/njs/api/game/viewPGN/${gid}?raw=true`;
    const pgnResponse = await fetch(pgnUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!pgnResponse.ok) {
      throw new Error(`Failed to fetch PGN: ${pgnResponse.status}`);
    }

    const pgn = await pgnResponse.text();

    // Try to extract title and players from the PGN
    const whiteMatch = pgn.match(/\[White "([^"]+)"\]/);
    const blackMatch = pgn.match(/\[Black "([^"]+)"\]/);
    const eventMatch = pgn.match(/\[Event "([^"]+)"\]/);
    const playedDateMatch = pgn.match(/\[Date "([^"]+)"\]/);

    if (whiteMatch && blackMatch) {
      players = `${whiteMatch[1]} vs ${blackMatch[1]}`;
    }
    if (eventMatch) {
      title = eventMatch[1];
    }

    const game: GameOfTheDay = {
      gid,
      title: title || "Game of the Day",
      players: players || "Unknown players",
      pgn,
      date:
        formatPgnDateForDisplay(playedDateMatch?.[1]) ||
        formatDateForDisplay(today),
    };

    return NextResponse.json({ status: "ok", game });
  } catch (error) {
    console.error("Random game of the day error:", error);
    return NextResponse.json(
      { error: "Failed to load game of the day" },
      { status: 500 }
    );
  }
}
