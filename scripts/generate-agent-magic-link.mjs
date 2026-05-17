#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const ENV_FILES = [".env.local", ".env.agent.local"];

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const contents = readFileSync(path, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function usage() {
  return [
    "Usage:",
    "  node scripts/generate-agent-magic-link.mjs <email> [--next /train] [--origin http://localhost:3000] [--json]",
    "",
    "Generates a Supabase magic link with the service role key without sending email.",
    "Open the printed link in Playwright to create an authenticated app session.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    email: "",
    nextPath: "/train",
    origin: process.env.PLAYWRIGHT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--next") {
      options.nextPath = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--next=")) {
      options.nextPath = arg.slice("--next=".length);
      continue;
    }
    if (arg === "--origin") {
      options.origin = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--origin=")) {
      options.origin = arg.slice("--origin=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!options.email) {
      options.email = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return options;
}

function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    throw new Error(`Invalid --origin value: ${origin}`);
  }
}

function normalizeNextPath(nextPath) {
  const msysPathPrefix = "C:/Program Files/Git";
  if (nextPath.startsWith(`${msysPathPrefix}/`)) {
    nextPath = nextPath.slice(msysPathPrefix.length);
  }

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    throw new Error(`Invalid --next value: ${nextPath || "(empty)"}`);
  }
  return nextPath;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildRedirectTo(origin, nextPath, tokenHash) {
  const url = new URL("/auth/agent-link", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("next", nextPath);
  return url.toString();
}

function buildProviderRedirectTo(origin, nextPath) {
  const url = new URL("/auth/email", origin);
  url.searchParams.set("next", nextPath);
  return url.toString();
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${result.actionLink}\n`);
  process.stderr.write(`\nemail: ${result.email}\n`);
  process.stderr.write(`redirectTo: ${result.redirectTo}\n`);
  process.stderr.write("Use once. Supabase magic links are single-use and expire.\n");
}

async function main() {
  for (const file of ENV_FILES) {
    loadEnvFile(resolve(process.cwd(), file));
  }

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const email = options.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Provide a valid email address.");
  }

  const origin = normalizeOrigin(options.origin);
  const nextPath = normalizeNextPath(options.nextPath);
  const providerRedirectTo = buildProviderRedirectTo(origin, nextPath);

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: providerRedirectTo,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error("Supabase did not return properties.hashed_token.");
  }
  const providerActionLink = data?.properties?.action_link ?? null;
  const redirectTo = buildRedirectTo(origin, nextPath, tokenHash);

  printResult(
    {
      email,
      actionLink: redirectTo,
      providerActionLink,
      redirectTo,
      next: nextPath,
      userId: data.user?.id ?? null,
    },
    options.json,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});
