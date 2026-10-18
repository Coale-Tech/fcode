import {
  readStoreSource,
  readStoreModule,
  readMainSource,
  readSharedTypesSource,
} from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [
  protocol,
  types,
  main,
  api,
  store,
  events,
  commands,
  hostRpc,
  hostSessions,
  hostTranscripts,
  enLocale,
] = await Promise.all([
  read("../../../packages/shared/src/protocol.ts"),
  readSharedTypesSource(),
  readMainSource(),
  read("../src/lib/api.ts"),
  readStoreSource(),
  readStoreModule("slices/events-slice.ts"),
  read("../electron/main/builtin-commands.ts"),
  read("../../../crates/host-core/src/rpc/mod.rs"),
  read("../../../crates/host-core/src/sessions.rs"),
  read("../../../crates/host-core/src/transcripts.rs"),
  read("../../../packages/i18n/src/locales/en/index.ts"),
]);

test("context compaction is wired through protocol v11 and the manual IPC path", () => {
  assert.match(protocol, /PROTOCOL_VERSION = 11/);
  assert.match(protocol, /agentCompact:\s*"pi-desktop\/agent\/compact"/);
  assert.match(types, /type ContextCompactionRecord/);
  assert.match(types, /type: "compaction_start"/);
  assert.match(types, /type: "compaction_end"/);
  assert.match(types, /fallback\?: ContextCompactionFallback/);
  assert.match(main, /handle\(IPC\.invoke\.agentCompact/);
  assert.match(
    main,
    /handle\(IPC\.invoke\.agentCompact[\s\S]*activeTurns\.has\(req\.sessionId\)/,
  );
  assert.match(main, /sidecar\.call\("agent\.compact"/);
  assert.match(api, /compact:\s*\(req: AgentCompactRequest\)/);
  assert.match(commands, /slash:\s*"compact"/);
  assert.match(hostRpc, /"session\.appendCompaction"/);
});

test("turn_end remains a per-tool-turn boundary rather than a terminal run state", () => {
  assert.match(
    store,
    /event\.type === "agent_end" \|\|\s*event\.type === "error"/,
  );
  assert.doesNotMatch(
    store,
    /event\.type === "agent_end" \|\|\s*event\.type === "turn_end"/,
  );
  assert.match(store, /case "agent_end":[\s\S]*?set\(\{ isRunning: false \}\)/);
  assert.match(store, /case "turn_end":\s*break/);
});



test("every checkpoint is durable, not just the newest one", () => {
  // One transcript row per compaction needs the whole chain to survive a
  // restart, a rewrite, and a fork.
  assert.match(types, /compactions\?: ContextCompactionRecord\[\]/);
  assert.match(hostTranscripts, /pub fn read_compactions\(/);
  assert.match(hostTranscripts, /pub fn write_transcript_with_compactions\(/);
  assert.doesNotMatch(hostTranscripts, /pub fn read_latest_compaction\(/);
  assert.match(hostSessions, /pub compactions: Vec<CompactionRecord>/);
  assert.match(hostSessions, /compaction: compactions\.last\(\)\.cloned\(\)/);
  assert.match(
    hostSessions,
    /\.filter\(\|record\| compaction_valid_for_records\(record, &records\)\)/,
  );
  assert.match(
    hostSessions,
    /\.filter_map\(\|record\| clone_compaction_for_fork\(record, &message_ids, &tool_call_ids\)\)/,
  );
});




test("compaction lifecycle keeps the renderer busy until its actual terminal event", () => {
  assert.doesNotMatch(types, /ContextCompactionPhase/);
  assert.match(
    store,
    /event\.type === "compaction_start"\s*\)/,
  );
  assert.match(
    store,
    /event\.type === "compaction_end" && event\.reason === "manual"/,
  );
  assert.match(
    store,
    /case "compaction_start":\s*set\(\{ isRunning: true \}\)/,
  );
  assert.match(
    store,
    /case "compaction_end":[\s\S]*event\.reason === "manual"\) set\(\{ isRunning: false \}\)/,
  );
  assert.match(store, /contextCompaction\.recovered/);
});

test("every compaction announces itself once, on top of the specific toasts", () => {
  const compactionEnd =
    events.match(/case "compaction_end":[\s\S]*?\n        case "agent_end":/)?.[0] ??
    "";
  assert.ok(compactionEnd.length > 0, "compaction_end handler not found");
  // Codex warns after every compaction; ours is unconditional and lands before
  // the three that describe something more specific.
  assert.match(
    compactionEnd,
    /if \(event\.ok\) \{[\s\S]*?get\(\)\.showToast\(i18n\.t\("contextCompaction\.longThreadWarning"\), \{\s*variant: "warning",\s*\}\);/,
  );
  assert.match(
    compactionEnd,
    /if \(event\.fallback\) \{\s*get\(\)\.showToast\(i18n\.t\("contextCompaction\.recovered"\)/,
  );
  assert.match(
    compactionEnd,
    /else if \(event\.reason === "overflow"\) \{\s*get\(\)\.showToast\(\s*i18n\.t\("contextCompaction\.retrying"\)/,
  );
  assert.match(
    compactionEnd,
    /else if \(event\.reason === "manual"\) \{\s*get\(\)\.showToast\(i18n\.t\("contextCompaction\.completed"\)/,
  );
  assert.equal(
    compactionEnd.match(/showToast/g)?.length,
    5,
    "unexpected number of compaction toasts",
  );
  assert.match(enLocale, /longThreadWarning:/);
});



