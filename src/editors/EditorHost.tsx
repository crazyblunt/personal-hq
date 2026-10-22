import { useUI } from '../app/ui';
import { EventEditor } from './EventEditor';
import { IdeaEditor } from './IdeaEditor';
import { ProjectEditor } from './ProjectEditor';
import { BugEditor, PromptEditor } from './SmallEditors';
import { TaskEditor } from './TaskEditor';

/** Renders whichever editor window is open. Keyed so each opening starts fresh. */
export function EditorHost() {
  const editor = useUI((s) => s.editor);
  if (!editor) return null;
  const key = `${editor.kind}:${'id' in editor ? (editor.id ?? 'new') : 'new'}`;
  switch (editor.kind) {
    case 'task':
      return <TaskEditor key={key} id={editor.id} defaults={editor.defaults} />;
    case 'event':
      return <EventEditor key={key} id={editor.id} defaults={editor.defaults} />;
    case 'project':
      return <ProjectEditor key={key} id={editor.id} defaults={editor.defaults} />;
    case 'idea':
      return <IdeaEditor key={key} id={editor.id} />;
    case 'bug':
      return <BugEditor key={key} id={editor.id} projectId={editor.projectId} />;
    case 'prompt':
      return <PromptEditor key={key} id={editor.id} />;
  }
}
