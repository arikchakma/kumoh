import { useEffect, useRef, useState } from 'react';

import { Section } from '~/components/section';
import { cn } from '~/utils/classname';

type ServerMessage =
  | { type: 'joined'; count: number }
  | { type: 'count'; count: number }
  | { type: 'message'; text: string; count: number };

type ChatMessage = { text: string; self: boolean; id: number };

function getWsUrl(room: string) {
  const base = import.meta.env.DEV
    ? 'ws://localhost:5173'
    : 'wss://api.kumoh.dev';
  return `${base}/api/objects/chat-room?room=${encodeURIComponent(room)}`;
}

export default function Objects() {
  const [room] = useState('demo');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting'
  );
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);
  const pendingRef = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl(room));
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as ServerMessage;

      switch (msg.type) {
        case 'joined':
        case 'count':
          setOnline(msg.count);
          break;
        case 'message':
          setOnline(msg.count);
          const isSelf = pendingRef.current.has(msg.text);
          if (isSelf) {
            pendingRef.current.delete(msg.text);
          }
          setMessages((prev) => [
            ...prev,
            { text: msg.text, self: isSelf, id: idRef.current++ },
          ]);
          break;
      }
    };

    ws.onclose = () => {
      setStatus('closed');
    };
    ws.onerror = () => {
      setStatus('closed');
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15_000);

    return () => {
      clearInterval(ping);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [room]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    pendingRef.current.add(text);
    wsRef.current.send(text);
    setInput('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Section.Heading>Chat Room · {room}</Section.Heading>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              status === 'open'
                ? 'bg-green-500'
                : status === 'connecting'
                  ? 'bg-yellow-400'
                  : 'bg-red-500'
            )}
          />
          <span className="text-[10px] font-pixel text-text-dim">
            {status === 'open'
              ? `${online} online`
              : status === 'connecting'
                ? 'connecting...'
                : 'disconnected'}
          </span>
        </div>
      </div>

      <p className="text-xs font-pixel text-text-dim italic">
        Each chat room is a Durable Object — a single process that lives on
        Cloudflare's edge. Open this page in multiple tabs to see live message
        delivery.
      </p>

      <div className="border border-ink h-72 overflow-y-auto p-3 flex flex-col gap-1.5 bg-white">
        {messages.length === 0 ? (
          <p className="text-[11px] font-pixel text-text-dim m-auto">
            No messages yet. Say something!
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn('flex', m.self ? 'justify-end' : 'justify-start')}
            >
              <span
                className={cn(
                  'px-2 py-1 text-[11px] font-pixel max-w-[75%] wrap-break-word',
                  m.self
                    ? 'bg-ink text-white'
                    : 'border border-border text-text'
                )}
              >
                {m.text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== 'open'}
          className="border border-border h-7 px-2 text-xs font-pixel flex-1 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status !== 'open' || !input.trim()}
          className="bg-ink text-white h-7 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
