import type { Digest, SlackMessage } from "./types";

/**
 * Build the weekly digest for one Slack channel.
 *
 * The week starts at `weekStart` and runs for 7 days.
 *
 * Returns:
 *  - topThreads: the 3 most active threads this week
 *  - unanswered: questions posted this week that nobody has answered
 */
export function buildDigest(messages: SlackMessage[], weekStart: Date): Digest {
  const weekStartSeconds = weekStart.getTime() / 1000;
  const weekEndSeconds = weekStartSeconds + 7 * 24 * 60 * 60;

  const isInReportingWeek = (timestamp: string): boolean => {
    const seconds = Number(timestamp);
    return seconds >= weekStartSeconds && seconds < weekEndSeconds;
  };

  const threadParents = new Map<string, SlackMessage>();
  const repliesThisWeek = new Map<string, number>();

  for (const message of messages) {
    if (!message.subtype && message.thread_ts === message.ts) {
      threadParents.set(message.ts, message);
    }
  }

  for (const message of messages) {
    if (
      message.subtype ||
      message.thread_ts === undefined ||
      message.thread_ts === message.ts ||
      !isInReportingWeek(message.ts)
    ) {
      continue;
    }

    const currentCount = repliesThisWeek.get(message.thread_ts) ?? 0;
    repliesThisWeek.set(message.thread_ts, currentCount + 1);
  }

  const topThreads: Digest["topThreads"] = [];

  for (const [threadTimestamp, replyCount] of repliesThisWeek) {
    const parent = threadParents.get(threadTimestamp);

    if (parent) {
      topThreads.push({
        thread_ts: threadTimestamp,
        text: parent.text,
        repliesThisWeek: replyCount,
      });
    }
  }

  topThreads.sort(
    (left, right) =>
      right.repliesThisWeek - left.repliesThisWeek ||
      Number(right.thread_ts) - Number(left.thread_ts),
  );

  const unanswered: Digest["unanswered"] = messages
    .filter((message) => {
      const isTopLevelMessage =
        message.thread_ts === undefined || message.thread_ts === message.ts;

      return (
        !message.subtype &&
        isTopLevelMessage &&
        isInReportingWeek(message.ts) &&
        message.text.trim().endsWith("?") &&
        !repliesThisWeek.has(message.ts)
      );
    })
    .map(({ ts, user, text }) => ({ ts, user, text }))
    .sort((left, right) => Number(right.ts) - Number(left.ts));

  return { topThreads: topThreads.slice(0, 3), unanswered };
}
