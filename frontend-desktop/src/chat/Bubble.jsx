import { BlocksRenderer, parseAssistantContent, UsageFooter } from './blocks';

// 解析用户消息内容：
// - 旧格式：纯文本
// - 新格式：JSON {text, images:[url|dataURL]}
function parseUserContent(content) {
  if (!content) return { text: '', images: [] };
  if (content[0] === '{') {
    try {
      const obj = JSON.parse(content);
      if (obj && (obj.text != null || Array.isArray(obj.images))) {
        return { text: obj.text || '', images: obj.images || [] };
      }
    } catch {}
  }
  return { text: String(content), images: [] };
}

export function UserBubble({ content }) {
  const { text, images } = parseUserContent(content);
  return (
    <div className="flex justify-end my-3">
      <div className="user-bubble">
        {images.length > 0 && (
          <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${text ? 'mb-2' : ''}`}>
            {images.map((src, i) => (
              <a
                key={i}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={src}
                  className="rounded-lg max-h-56 max-w-[240px] object-cover ring-1 ring-white/30 shadow-soft hover:scale-[1.02] transition"
                  alt=""
                />
              </a>
            ))}
          </div>
        )}
        {text && <div>{text}</div>}
      </div>
    </div>
  );
}

export function AssistantBubble({ message, live = false, liveBlocks = null }) {
  const blocks = liveBlocks || parseAssistantContent(message?.content || '');
  return (
    <div className="flex justify-start my-3">
      <div className="assistant-bubble">
        <BlocksRenderer blocks={blocks} live={live} />
        {!live && message?.usage && <UsageFooter usageJSON={message.usage} />}
      </div>
    </div>
  );
}
