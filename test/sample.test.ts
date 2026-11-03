import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/digest";
import type { Digest, SlackMessage } from "../src/types";
import sampleMessages from "../data/sample-messages.json";
import sampleDigest from "../data/sample-digest.json";

const weekStart = new Date("2026-09-21T00:00:00Z");

describe("buildDigest on the sample", () => {
  it("returns an empty digest for an empty channel", () => {
    expect(buildDigest([], weekStart)).toEqual({ topThreads: [], unanswered: [] });
  });

  it("produces sample-digest.json from sample-messages.json", () => {
    const result = buildDigest(sampleMessages as SlackMessage[], weekStart);
    expect(result).toEqual(sampleDigest as Digest);
  });
});

describe("buildDigest edge cases", () => {
  it("counts only human replies posted inside the reporting week", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1789948799.000000",
        thread_ts: "1789948799.000000",
        user: "parent",
        text: "A thread that began before the week",
        reply_count: 99,
      },
      {
        ts: "1789948800.000000",
        thread_ts: "1789948799.000000",
        user: "at-start",
        text: "Included at the start boundary",
      },
      {
        ts: "1790000000.000000",
        thread_ts: "1789948799.000000",
        user: "during-week",
        text: "Included during the week",
      },
      {
        ts: "1790001000.000000",
        thread_ts: "1789948799.000000",
        user: "bot",
        text: "Excluded bot reply",
        subtype: "bot_message",
      },
      {
        ts: "1790553600.000000",
        thread_ts: "1789948799.000000",
        user: "at-end",
        text: "Excluded at the end boundary",
      },
    ];
    const originalMessages = structuredClone(messages);

    expect(buildDigest(messages, weekStart).topThreads).toEqual([
      {
        thread_ts: "1789948799.000000",
        text: "A thread that began before the week",
        repliesThisWeek: 2,
      },
    ]);
    expect(messages).toEqual(originalMessages);
  });

  it("uses the newer parent timestamp to break equal reply-count ties", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1790000300.000000",
        thread_ts: "1789948804.000000",
        user: "reply-d",
        text: "Reply",
      },
      {
        ts: "1789948801.000000",
        thread_ts: "1789948801.000000",
        user: "parent-a",
        text: "Thread A",
      },
      {
        ts: "1790000200.000000",
        thread_ts: "1789948802.000000",
        user: "reply-b-2",
        text: "Reply",
      },
      {
        ts: "1789948804.000000",
        thread_ts: "1789948804.000000",
        user: "parent-d",
        text: "Thread D",
      },
      {
        ts: "1790000100.000000",
        thread_ts: "1789948801.000000",
        user: "reply-a-1",
        text: "Reply",
      },
      {
        ts: "1789948803.000000",
        thread_ts: "1789948803.000000",
        user: "parent-c",
        text: "Thread C",
      },
      {
        ts: "1790000000.000000",
        thread_ts: "1789948802.000000",
        user: "reply-b-1",
        text: "Reply",
      },
      {
        ts: "1789948802.000000",
        thread_ts: "1789948802.000000",
        user: "parent-b",
        text: "Thread B",
      },
      {
        ts: "1790000400.000000",
        thread_ts: "1789948803.000000",
        user: "reply-c",
        text: "Reply",
      },
      {
        ts: "1790000500.000000",
        thread_ts: "1789948801.000000",
        user: "reply-a-2",
        text: "Reply",
      },
    ];

    expect(buildDigest(messages, weekStart).topThreads).toEqual([
      { thread_ts: "1789948802.000000", text: "Thread B", repliesThisWeek: 2 },
      { thread_ts: "1789948801.000000", text: "Thread A", repliesThisWeek: 2 },
      { thread_ts: "1789948804.000000", text: "Thread D", repliesThisWeek: 1 },
    ]);
  });

  it("returns unanswered human questions newest first", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1790553601.000000",
        thread_ts: "1790500000.000000",
        user: "future-replier",
        text: "This reply is after the reporting week",
      },
      {
        ts: "1790200000.000000",
        user: "newer-questioner",
        text: "Newest plain unanswered question?",
      },
      {
        ts: "1790301000.000000",
        thread_ts: "1790300000.000000",
        user: "human-replier",
        text: "A human answered this one",
      },
      {
        ts: "1790100000.000000",
        user: "older-questioner",
        text: "Older plain unanswered question?",
      },
      {
        ts: "1790401000.000000",
        thread_ts: "1790400000.000000",
        user: "bot",
        text: "Automated acknowledgement",
        subtype: "bot_message",
      },
      {
        ts: "1790500000.000000",
        thread_ts: "1790500000.000000",
        user: "late-questioner",
        text: "Answered after the reporting week?",
        reply_count: 1,
      },
      {
        ts: "1790400000.000000",
        thread_ts: "1790400000.000000",
        user: "bot-questioner",
        text: "Does a bot acknowledgement count?",
        reply_count: 1,
      },
      {
        ts: "1790300000.000000",
        thread_ts: "1790300000.000000",
        user: "answered-questioner",
        text: "Did a human answer this question?",
        reply_count: 1,
      },
      {
        ts: "1790250000.000000",
        user: "statement-author",
        text: "Questions? Read the documentation.",
      },
      {
        ts: "1790240000.000000",
        user: "implicit-questioner",
        text: "Anyone have a checklist",
      },
      {
        ts: "1790230000.000000",
        user: "joiner",
        text: "Is this a question?",
        subtype: "channel_join",
      },
    ];

    expect(buildDigest(messages, weekStart).unanswered).toEqual([
      {
        ts: "1790500000.000000",
        user: "late-questioner",
        text: "Answered after the reporting week?",
      },
      {
        ts: "1790400000.000000",
        user: "bot-questioner",
        text: "Does a bot acknowledgement count?",
      },
      {
        ts: "1790200000.000000",
        user: "newer-questioner",
        text: "Newest plain unanswered question?",
      },
      {
        ts: "1790100000.000000",
        user: "older-questioner",
        text: "Older plain unanswered question?",
      },
    ]);
  });
});
