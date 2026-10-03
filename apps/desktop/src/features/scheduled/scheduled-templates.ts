/**
 * Static catalog of schedule templates (I.4).
 * Each entry pre-fills title, prompt, cadence and schedule in ScheduledEditor.
 */
import type { ScheduledTaskCadence, ScheduledTaskSchedule } from "@pi-desktop/shared";

export type ScheduledTemplate = {
  id: string;
  /** i18n key for the picker label. */
  nameKey: string;
  title: string;
  prompt: string;
  cadence: ScheduledTaskCadence;
  schedule: ScheduledTaskSchedule;
};

export const SCHEDULED_TEMPLATES: readonly ScheduledTemplate[] = [
  {
    id: "daily-digest",
    nameKey: "scheduled.templateDailyDigest",
    title: "Daily digest",
    prompt:
      "Summarize today's git log, open issues, and any blocked PRs. Write a concise digest to ~/DAILY_DIGEST.md.",
    cadence: "daily",
    schedule: { hour: 8, minute: 0, weekday: 0 },
  },
  {
    id: "weekly-review",
    nameKey: "scheduled.templateWeeklyReview",
    title: "Weekly repo review",
    prompt:
      "Review the repository for stale branches, outdated dependencies, and open issues older than 7 days. Write a summary to ~/WEEKLY_REVIEW.md.",
    cadence: "weekly",
    schedule: { hour: 9, minute: 0, weekday: 0, weekdays: [0] },
  },
  {
    id: "morning-standup",
    nameKey: "scheduled.templateMorningStandup",
    title: "Morning standup",
    prompt:
      "Check git status, any failing CI jobs, and today's open issues. Print a brief standup summary to the terminal.",
    cadence: "daily",
    schedule: { hour: 9, minute: 0, weekday: 0 },
  },
  {
    id: "dependency-check",
    nameKey: "scheduled.templateDependencyCheck",
    title: "Dependency check",
    prompt:
      "Run the package manager's outdated command and report any packages with major version upgrades available.",
    cadence: "weekly",
    schedule: { hour: 10, minute: 0, weekday: 0, weekdays: [0] },
  },
  {
    id: "test-sweep",
    nameKey: "scheduled.templateTestSweep",
    title: "Test sweep",
    prompt:
      "Run the full test suite and report any failures. If all pass, summarize test coverage highlights.",
    cadence: "daily",
    schedule: { hour: 7, minute: 0, weekday: 0 },
  },
  {
    id: "inbox-triage",
    nameKey: "scheduled.templateInboxTriage",
    title: "Inbox triage",
    prompt:
      "List all open GitHub issues and PRs awaiting review. Prioritize them by age and label the most urgent ones.",
    cadence: "daily",
    schedule: { hour: 8, minute: 30, weekday: 0 },
  },
] as const;
