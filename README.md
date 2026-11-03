# Tightknit Co-op Interview Exercise

This repository implements a weekly digest for one Slack channel. The digest is intended for a community administrator and contains:

1. The three threads with the most human replies during the reporting week.
2. Questions posted during the reporting week that received no human reply before the week ended.

The original exercise instructions are available in [this Google Doc](https://docs.google.com/document/d/13_4C8eQFjhEEvfY8hTlp4ikYebg9yp0Dypb3UpRSj4o/edit?tab=t.0).

## Quick start

Node.js 20 or later is required. The repository includes a lockfile, so `npm ci` is the most reproducible installation command.

```sh
npm ci
npm test
npm run typecheck
```

Run the digest against the full 551-message channel export:

```sh
npm run digest
```

Run it against the smaller sample input:

```sh
npm run digest -- data/sample-messages.json
```

## Project navigation

| Path | Purpose |
| --- | --- |
| `src/digest.ts` | Implements `buildDigest` and all weekly digest rules. |
| `src/types.ts` | Defines the `SlackMessage` input and `Digest` output types. |
| `src/run.ts` | Loads a JSON data file, calls `buildDigest`, and prints the result. |
| `data/sample-messages.json` | An 11-message example input. |
| `data/sample-digest.json` | The exact expected output for the sample input. |
| `data/messages.json` | The full 551-message channel export. |
| `test/sample.test.ts` | Covers the sample and the important edge cases. |

For a code walkthrough, start with `src/types.ts`, continue to `src/digest.ts`, and finish with `test/sample.test.ts`.

## Function contract

```ts
export function buildDigest(
  messages: SlackMessage[],
  weekStart: Date,
): Digest;
```

The function receives messages from one Slack channel and returns:

```ts
type Digest = {
  topThreads: {
    thread_ts: string;
    text: string;
    repliesThisWeek: number;
  }[];
  unanswered: {
    ts: string;
    user: string;
    text: string;
  }[];
};
```

`buildDigest` is deterministic and does not mutate the input array or its messages.

## Understanding the Slack data

Each input record has the following shape:

```ts
type SlackMessage = {
  ts: string;
  thread_ts?: string;
  user: string;
  text: string;
  reply_count?: number;
  subtype?: "bot_message" | "channel_join";
};
```

The important threading rules are:

- `ts` is the message's Slack timestamp.
- A thread parent with replies has `thread_ts === ts`.
- A reply has `thread_ts` equal to its parent's `ts`.
- A top-level message without replies normally has no `thread_ts`.
- `reply_count` is the thread's total reply count, not its reply count for the requested week.
- Any message with a `subtype` is excluded from the digest. This removes bot messages and channel-join events.

## Reporting-week rules

The reporting week is a half-open interval:

```text
weekStart <= message timestamp < weekStart + 7 days
```

This makes the boundaries unambiguous:

- A message exactly at `weekStart` is included.
- A message exactly seven days after `weekStart` is excluded.
- A thread may have started before the week and still qualify if it received replies during the week.

Slack timestamps are converted from strings to numbers only when they need to be compared or sorted.

## What counts as a weekly reply

A message contributes to `repliesThisWeek` only when all of the following are true:

1. It has no `subtype`.
2. It has a `thread_ts`.
3. Its `thread_ts` differs from its own `ts`, proving that it is a reply rather than the parent.
4. Its timestamp is inside the reporting week.

The implementation counts the actual reply records rather than using `reply_count`. This is necessary because `reply_count` may include activity from before or after the reporting week.

## How `topThreads` is built

The implementation uses two direct passes over the messages.

### Pass 1: index thread parents

Every human thread parent is stored in a `Map` keyed by its timestamp:

```text
thread parent timestamp -> parent message
```

This lets the function find the parent text after it has counted the replies. Parents are indexed even when they were posted before the reporting week because an older thread can still receive new weekly activity.

### Pass 2: count weekly replies

Every qualifying reply increments a second `Map`:

```text
thread parent timestamp -> number of qualifying replies this week
```

The reply counts are then joined with the indexed parents to create the required output objects.

### Ranking

Threads are sorted by:

1. `repliesThisWeek`, descending.
2. Parent timestamp, descending, when two threads have the same reply count.

Only the first three results are returned. If fewer than three threads received qualifying replies, the result contains fewer than three entries.

## How `unanswered` is built

A message is considered an unanswered question when all of the following are true:

1. It has no `subtype`.
2. It is a top-level message rather than a reply.
3. It was posted during the reporting week.
4. Its trimmed text ends with `?`.
5. Its timestamp has no qualifying human replies in the weekly reply map.

Unanswered questions are returned newest first.

This is intentionally a deterministic, non-AI question rule. It does not attempt to infer implicit questions that have no question mark or determine whether a reply is semantically helpful.

## Important behavior and edge cases

| Case | Behavior |
| --- | --- |
| Empty channel | Returns empty `topThreads` and `unanswered` arrays. |
| Parent posted before the week | The thread can qualify through replies posted during the week. |
| Parent record | Never counts as one of its own replies. |
| Bot reply | Does not increase thread activity or mark a question as answered. |
| Channel-join event | Excluded completely. |
| Reply exactly at `weekStart` | Included. |
| Reply exactly at the end boundary | Excluded. |
| Reply posted after the week | Does not retroactively answer that week's question. |
| Large `reply_count` | Ignored in favor of the actual weekly reply records. |
| Equal thread activity | Newer parent timestamp wins the tie. |
| Self-reply | Counts as a reply because user diversity is not part of the contract. |
| Missing thread parent | The thread is omitted because the required parent text is unavailable. |
| Input messages in arbitrary order | Results remain deterministic. |

## Complexity

Let:

- `n` be the number of messages.
- `t` be the number of threads with qualifying weekly replies.
- `q` be the number of unanswered-question candidates.

The two message passes are `O(n)`. Sorting the thread results and unanswered questions costs `O(t log t)` and `O(q log q)`, respectively. The maps and output arrays use `O(n)` space in the worst case.

This avoids repeatedly scanning all messages for every thread, which would produce unnecessary `O(n^2)` work.

## Tests

Run all tests with:

```sh
npm test
```

The test suite verifies:

- An empty channel.
- Exact equality with `data/sample-digest.json`.
- Start-inclusive and end-exclusive reply boundaries.
- Threads whose parents predate the reporting week.
- Bot-message filtering.
- Ignoring all-time `reply_count` values.
- Deterministic tie-breaking with arbitrarily ordered input.
- Human replies versus bot-only replies.
- Replies posted after the reporting week.
- Newest-first unanswered ordering.
- Input immutability.

Run the strict TypeScript check separately with:

```sh
npm run typecheck
```

## Verified full-data result

For the supplied week beginning `2026-09-21T00:00:00Z`, the full dataset produces three top threads with 11, 9, and 7 qualifying replies. It also produces eight unanswered questions under the deterministic `text.endsWith("?")` rule.

The sample dataset produces exactly the contents of `data/sample-digest.json`.

## Deliberate non-goals

The core implementation does not include the optional stretch goals from the exercise:

- AI-generated prose summaries.
- Semantic or implicit-question detection.
- Duplicate-question merging.
- User-diversity scoring for thread activity.
- Slack API pagination, caching, or rate-limit orchestration.

These can be added later without changing the current `buildDigest` interface.

## License

This project is open source under the [MIT License](LICENSE).
