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
