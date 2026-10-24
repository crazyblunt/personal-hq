import { firstLine } from '../lib/util';
import type { Idea, Note } from './types';

/** An idea's display title: its title, or the first line of its body. */
export const ideaTitle = (i: Pick<Idea, 'title' | 'body'>) => i.title.trim() || firstLine(i.body, 70) || 'Untitled idea';

export const noteTitle = (n: Pick<Note, 'title'>) => n.title.trim() || 'Untitled note';
