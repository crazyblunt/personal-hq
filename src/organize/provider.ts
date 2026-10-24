/**
 * Organization providers produce review suggestions. Only the local,
 * rule-based provider exists today.
 *
 * Adding a real AI provider later means writing another `OrganizerProvider`
 * whose `review` calls your own server endpoint (which holds the API key),
 * and asking the user to turn it on explicitly in Settings. Never call an AI
 * API straight from the browser, and never send data without that opt-in.
 */
import { buildReview, type ReviewInput, type Suggestion } from './review';

export interface OrganizerProvider {
  id: string;
  label: string;
  /** "local" runs entirely in this browser; "remote" would send data elsewhere. */
  kind: 'local' | 'remote';
  description: string;
  review(input: ReviewInput): Promise<Suggestion[]>;
}

export const localRulesProvider: OrganizerProvider = {
  id: 'local-rules',
  label: 'Local rules',
  kind: 'local',
  description: 'Keyword rules, word overlap, and fixed templates. Runs in this browser; nothing is sent anywhere.',
  review: async (input) => buildReview(input),
};

export const providers: OrganizerProvider[] = [localRulesProvider];

/** Every source of suggestions, for Settings › Claude. Only the first runs without sending anything. */
export const SUGGESTION_SOURCES: { id: 'local-rules' | 'claude-manual' | 'claude-live'; label: string; kind: 'local' | 'manual' | 'remote'; description: string }[] = [
  { id: 'local-rules', label: 'Local rules', kind: 'local', description: 'Keyword rules, word overlap, and fixed templates. Runs in this browser; nothing is sent anywhere.' },
  { id: 'claude-manual', label: 'Claude (copy/paste)', kind: 'manual', description: 'You copy a prompt into Claude.ai and paste the reply back. Works with any Claude.ai account; no setup.' },
  {
    id: 'claude-live',
    label: 'Claude (live)',
    kind: 'remote',
    description: 'Sends the items shown before each request to Anthropic through your Supabase function. Not end-to-end encrypted. Off until set up.',
  },
];

