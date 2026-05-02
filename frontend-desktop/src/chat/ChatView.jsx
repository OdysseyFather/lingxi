import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { AgentBadge } from './AgentPicker';

export function ChatView() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 pt-4 flex items-center gap-2">
        <AgentBadge />
      </div>
      <MessageList />
      <Composer />
    </div>
  );
}
