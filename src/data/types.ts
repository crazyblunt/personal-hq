/**
 * Personal HQ data model. Every record the user creates lives in one of the
 * collections below; settings and widget layout live in `Settings`.
 *
 * Dates without a time (due dates, event days) are local calendar days written
 * as `YYYY-MM-DD` ("date keys"). Timestamps (`createdAt`, `completedAt`, ...)
 * are full ISO strings.
 */

export type DateKey = string;

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Links between items ---------- */

export const LINKABLE_KINDS = ['task', 'note', 'idea', 'project'] as const;
export type LinkableKind = (typeof LINKABLE_KINDS)[number];

/** A reference to a task, note, idea, or project, used for links between items. */
export interface ItemRef {
  kind: LinkableKind;
  id: string;
}

/* ---------- Tasks ---------- */

export const TASK_STATUSES = ['inbox', 'planned', 'in_progress', 'waiting', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  planned: 'Planned',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
};

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface SourceRef {
  kind: 'idea' | 'note';
  id: string;
}

export interface Task extends BaseRecord {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  category: string;
  tags: string[];
  dueDate: DateKey | null;
  projectId: string | null;
  eventId: string | null;
  milestoneId: string | null;
  /** The day this task was added to My Day. It only counts for that day. */
  myDay: DateKey | null;
  subtasks: Subtask[];
  assignee: string;
  order: number;
  completedAt: string | null;
  source: SourceRef | null;
  /** Links this task added to other items (see `src/data/linking.ts`). */
  itemLinks: ItemRef[];
}

/* ---------- Ideas / Brain dump ---------- */

export const IDEA_KINDS = ['idea', 'link', 'thought', 'plan', 'reminder'] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number];
export const IDEA_KIND_LABEL: Record<IdeaKind, string> = {
  idea: 'Idea',
  link: 'Link',
  thought: 'Thought',
  plan: 'Plan',
  reminder: 'Reminder',
};

export interface ConvertedRef {
  kind: 'task' | 'note' | 'project';
  id: string;
  at: string;
}

export interface Idea extends BaseRecord {
  title: string;
  body: string;
  kind: IdeaKind;
  url: string;
  tags: string[];
  category: string;
  favorite: boolean;
  /** True until the user files it somewhere. Inbox items show in the Inbox. */
  inbox: boolean;
  archived: boolean;
  projectId: string | null;
  relatedIds: string[];
  converted: ConvertedRef[];
  remindOn: DateKey | null;
  itemLinks: ItemRef[];
}

/* ---------- Notes ---------- */

export const NOTE_CATEGORIES = ['School', 'Coding', 'Personal', 'Meeting', 'Research', 'Reference', 'Checklist'] as const;

export interface Note extends BaseRecord {
  title: string;
  body: string;
  tags: string[];
  category: string;
  favorite: boolean;
  projectId: string | null;
  taskIds: string[];
  source: SourceRef | null;
  itemLinks: ItemRef[];
}

/* ---------- Projects ---------- */

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

export const PROJECT_CATEGORIES = ['coding', 'school', 'business', 'personal', 'other'] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export const PROJECT_CATEGORY_LABEL: Record<ProjectCategory, string> = {
  coding: 'Coding',
  school: 'School',
  business: 'Business',
  personal: 'Personal goal',
  other: 'Other',
};

export const PROJECT_COLORS = ['violet', 'blue', 'cyan', 'emerald', 'amber', 'orange', 'rose', 'pink'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const LINK_KINDS = ['repo', 'session', 'pr', 'website', 'doc', 'other'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  repo: 'Repository',
  session: 'Claude Code session',
  pr: 'Pull request',
  website: 'Website',
  doc: 'Document',
  other: 'Link',
};

export interface ProjectLink {
  id: string;
  label: string;
  url: string;
  kind: LinkKind;
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: DateKey | null;
  done: boolean;
}

export interface Project extends BaseRecord {
  name: string;
  description: string;
  category: ProjectCategory;
  status: ProjectStatus;
  color: ProjectColor;
  targetDate: DateKey | null;
  techStack: string[];
  repoUrl: string;
  links: ProjectLink[];
  milestones: Milestone[];
  /** Status to return to when an archived project is restored. */
  archivedFromStatus: Exclude<ProjectStatus, 'archived'> | null;
  tags: string[];
  itemLinks: ItemRef[];
}

/* ---------- Bugs (from Agent Command Center) ---------- */

export const BUG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];
export const BUG_STATUSES = ['open', 'investigating', 'fixed', 'wont_fix'] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];
export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  fixed: 'Fixed',
  wont_fix: "Won't fix",
};

export interface Bug extends BaseRecord {
  projectId: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  severity: BugSeverity;
  status: BugStatus;
  resolvedAt: string | null;
}

/* ---------- Prompt library (from Agent Command Center) ---------- */

export interface Prompt extends BaseRecord {
  title: string;
  body: string;
  tags: string[];
  projectId: string | null;
  favorite: boolean;
  copyCount: number;
  lastCopiedAt: string | null;
}

/* ---------- Calendar ---------- */

export interface CalendarEvent extends BaseRecord {
  title: string;
  description: string;
  startDate: DateKey;
  /** `HH:MM`, or null for all-day events. */
  startTime: string | null;
  endDate: DateKey | null;
  endTime: string | null;
  allDay: boolean;
  projectId: string | null;
}

/* ---------- Activity log ---------- */

export const ENTITY_KINDS = ['task', 'idea', 'note', 'project', 'event', 'bug', 'prompt', 'focus', 'workspace'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ACTIVITY_ACTIONS = [
  'created',
  'updated',
  'completed',
  'reopened',
  'deleted',
  'archived',
  'restored',
  'converted',
  'imported',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface ActivityEntry {
  id: string;
  at: string;
  action: ActivityAction;
  entity: EntityKind;
  entityId: string;
  title: string;
  projectId: string | null;
  detail: string;
  /** True for entries rebuilt from Agent Command Center record timestamps during migration. */
  backfilled?: boolean;
}

/* ---------- Settings ---------- */

export const THEMES = ['charcoal', 'graphite', 'phosphor', 'amber', 'classic', 'auto'] as const;
export type ThemeName = (typeof THEMES)[number];
export const THEME_LABEL: Record<ThemeName, string> = {
  charcoal: 'Charcoal',
  graphite: 'Graphite',
  phosphor: 'Phosphor terminal',
  amber: 'Amber CRT',
  classic: 'Classic gray (light)',
  auto: 'Auto (Charcoal / Classic gray)',
};

export const ACCENTS = ['green', 'amber', 'purple', 'blue', 'teal', 'rust'] as const;
export type AccentName = (typeof ACCENTS)[number];

export const DENSITIES = ['compact', 'comfortable'] as const;
export type Density = (typeof DENSITIES)[number];

export const SECTIONS = [
  'myday',
  'inbox',
  'tasks',
  'calendar',
  'ideas',
  'projects',
  'notes',
  'explorer',
  'activity',
  'utilities',
  'prefs',
] as const;
export type SectionId = (typeof SECTIONS)[number];

export const WIDGET_IDS = [
  'today',
  'deadlines',
  'quick-actions',
  'projects',
  'captures',
  'activity-graph',
  'recent-activity',
  'clock',
  'countdowns',
  'focus',
  'shortcuts',
  'random-idea',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export const WIDGET_SIZES = ['sm', 'md', 'lg'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export interface WidgetPref {
  id: WidgetId;
  enabled: boolean;
  /** Width class kept for older copies of the app; derived from `w`. */
  size: WidgetSize;
  /** Position and size on the 12-column My Day grid, in cells. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface Shortcut {
  id: string;
  label: string;
  url: string;
}

export interface Countdown {
  id: string;
  label: string;
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (local time). */
  target: string;
}

/* ---------- Explorer views ---------- */

export interface ExplorerFilters {
  /** Empty means every kind. */
  kinds: LinkableKind[];
  query: string;
  tag: string;
  projectId: string;
  state: 'open' | 'done' | 'archived' | 'all';
}

export const EXPLORER_SORT_KEYS = ['type', 'title', 'status', 'project', 'date', 'updated', 'links'] as const;

export interface ExplorerSort {
  key: (typeof EXPLORER_SORT_KEYS)[number];
  dir: 'asc' | 'desc';
}

export interface SavedView {
  id: string;
  name: string;
  filters: ExplorerFilters;
  sort: ExplorerSort;
}

export interface Settings {
  theme: ThemeName;
  accent: AccentName;
  density: Density;
  startupPage: SectionId;
  defaultPriority: Priority;
  defaultTaskStatus: 'inbox' | 'planned';
  weekStartsOn: 0 | 1;
  clock24h: boolean;
  widgets: WidgetPref[];
  shortcuts: Shortcut[];
  countdowns: Countdown[];
  focusMinutes: number;
  breakMinutes: number;
  /** Saved Explorer views (filters and sort). */
  views: SavedView[];
  /** When settings last changed, so sync can keep the newest copy. */
  updatedAt?: string;
}

/* ---------- Workspace ---------- */

export const COLLECTIONS = ['tasks', 'ideas', 'notes', 'projects', 'events', 'bugs', 'prompts', 'activity'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export interface Collections {
  tasks: Task[];
  ideas: Idea[];
  notes: Note[];
  projects: Project[];
  events: CalendarEvent[];
  bugs: Bug[];
  prompts: Prompt[];
  activity: ActivityEntry[];
}

export interface WorkspaceData extends Collections {
  settings: Settings;
}

export const COLLECTION_LABEL: Record<CollectionName, string> = {
  tasks: 'Tasks',
  ideas: 'Ideas',
  notes: 'Notes',
  projects: 'Projects',
  events: 'Events',
  bugs: 'Bugs',
  prompts: 'Prompts',
  activity: 'Activity',
};

export const SCHEMA_VERSION = 1;
export const APP_ID = 'personal-hq';
