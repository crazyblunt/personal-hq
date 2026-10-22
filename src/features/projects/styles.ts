import type { ProjectStatus } from '../../data/types';

export const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  active: 'border-ok-fill text-ok',
  paused: 'border-warn-fill text-warn',
  completed: 'border-purple-fill text-purple',
  archived: 'border-line-strong text-subtle',
};
