import { AlarmClock, Clock, History, Link2, Shuffle, Timer, Wrench } from 'lucide-react';
import { PageHeader, Panel } from '../../ui/bits';
import { ClockTool, CountdownsTool, FocusTool, RandomIdeaTool, RecentTool, ShortcutsTool } from './tools';

export function UtilitiesPage() {
  return (
    <>
      <PageHeader title="Utilities" icon={Wrench} description="Small built-in tools. Each one can also be shown on My Day." />
      <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Clock" icon={<Clock />}>
          <div className="p-2">
            <ClockTool large />
          </div>
        </Panel>
        <Panel title="Focus timer" icon={<Timer />}>
          <div className="p-2">
            <FocusTool />
          </div>
        </Panel>
        <Panel title="Countdowns" icon={<AlarmClock />}>
          <div className="p-2">
            <CountdownsTool />
          </div>
        </Panel>
        <Panel title="Shortcuts" icon={<Link2 />} className="md:col-span-2 xl:col-span-1">
          <div className="p-2">
            <ShortcutsTool editable />
          </div>
        </Panel>
        <Panel title="Random idea picker" icon={<Shuffle />}>
          <div className="p-2">
            <RandomIdeaTool />
          </div>
        </Panel>
        <Panel title="Recently used" icon={<History />}>
          <div className="p-2">
            <RecentTool limit={12} />
          </div>
        </Panel>
      </div>
    </>
  );
}
