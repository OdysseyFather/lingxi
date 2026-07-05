export default function ChatList({ chats, activeId, onSelect, onCreate }) {
  return (
    <div className="w-64 bg-gray-50 border-r h-screen flex flex-col">
      <button onClick={onCreate} className="m-4 p-2 bg-blue-500 text-white rounded">
        新对话
      </button>
      <div className="flex-1 overflow-y-auto">
        {chats.map(chat => (
          <div
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            className={`p-3 cursor-pointer border-b ${activeId === chat.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
          >
            {chat.title}
          </div>
        ))}
      </div>
    </div>
  );
}
