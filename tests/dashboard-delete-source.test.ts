import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync("components/dashboard-client.tsx", "utf8");

test("dashboard unselects a queue when local deletion empties it", () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*if \(!selectedBucket\) return;[\s\S]*if \(bucketCounts\[selectedBucket\] === 0\) \{[\s\S]*setSelectedBucket\(null\);[\s\S]*\}/,
  );
});

test("dashboard removes deleted queue rows without an eight-second success delay", () => {
  assert.doesNotMatch(source, /setTimeout\(\(\) => \{[\s\S]*onDelete\(position\.id\);[\s\S]*\},\s*8300\)/);
  assert.match(
    source,
    /const deleteRequest = fetch\(`\/api\/dashboard\/mistakes\/\$\{encodeURIComponent\(position\.id\)\}\/delete`/,
  );
  assert.match(
    source,
    /deleteRemoveTimerRef\.current = window\.setTimeout\(\(\) => \{[\s\S]*onDelete\(position\.id\);[\s\S]*\}, QUEUE_DELETE_ANIMATION_MS\);[\s\S]*const res = await deleteRequest/,
  );
});

test("dashboard uses a gentle fade and collapse for deleted queue rows", () => {
  assert.match(source, /const QUEUE_DELETE_ANIMATION_MS = 520;/);
  assert.match(source, /duration-\[520ms\]/);
  assert.match(source, /ease-\[cubic-bezier\(0\.22,1,0\.36,1\)\]/);
  assert.match(source, /scale-\[0\.985\]/);
});

test("dashboard cancels the deferred row removal when delete fails", () => {
  assert.match(source, /const deleteRemoveTimerRef = useRef<number \| null>\(null\);/);
  assert.match(source, /deleteRemoveTimerRef\.current = window\.setTimeout/);
  assert.match(source, /window\.clearTimeout\(deleteRemoveTimerRef\.current\);[\s\S]*deleteRemoveTimerRef\.current = null;[\s\S]*onDeleteRollback\(position\.id\)/);
});
