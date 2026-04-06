import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import { Section } from '~/components/section';
import { cn } from '~/utils/classname';

type ServerMessage =
  | { type: 'joined'; count: number }
  | { type: 'count'; count: number }
  | { type: 'message'; username: string; text: string; count: number }
  | {
      type: 'history';
      messages: Array<{ username: string; text: string; createdAt: number }>;
    };

type ChatMessage = {
  id: number;
  username: string;
  text: string;
  self: boolean;
};

const USERNAME_KEY = 'chat-username';

function getWsUrl(roomId: string, username: string) {
  const base = import.meta.env.DEV
    ? 'ws://localhost:5173'
    : 'wss://api.kumoh.dev';
  return `${base}/api/objects/chat-room?room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(username)}`;
}

export default function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();

  const savedUsername =
    (location.state as { username?: string } | null)?.username ??
    localStorage.getItem(USERNAME_KEY) ??
    '';

  const [username, setUsername] = useState(savedUsername);
  const [nameInput, setNameInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting'
  );
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!username || !roomId) {
      return;
    }

    localStorage.setItem(USERNAME_KEY, username);

    const ws = new WebSocket(getWsUrl(roomId, username));
    wsRef.current = ws;

    ws.onopen = () => setStatus('open');

    ws.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as ServerMessage;

      switch (msg.type) {
        case 'history':
          setMessages(
            msg.messages.map((m) => ({
              id: idRef.current++,
              username: m.username,
              text: m.text,
              self: m.username === username,
            }))
          );
          break;
        case 'joined':
        case 'count':
          setOnline(msg.count);
          break;
        case 'message':
          setOnline(msg.count);
          setMessages((prev) => [
            ...prev,
            {
              id: idRef.current++,
              username: msg.username,
              text: msg.text,
              self: msg.username === username,
            },
          ]);
          break;
      }
    };

    ws.onclose = () => setStatus('closed');
    ws.onerror = () => setStatus('closed');

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
  }, [username, roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function joinWithName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      return;
    }
    setUsername(name);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'message', text }));
    setInput('');
  }

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!username) {
    return (
      <div className="space-y-6">
        <div>
          <Section.Heading>Room: {roomId}</Section.Heading>
          <p className="text-xs font-pixel text-text-dim">
            Enter your name to join this room.
          </p>
        </div>
        <form onSubmit={joinWithName} className="flex gap-2">
          <input
            type="text"
            placeholder="Your name..."
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
            className="border border-border h-8 px-2 text-xs font-pixel flex-1"
            maxLength={32}
          />
          <button
            type="submit"
            disabled={!nameInput.trim()}
            className="bg-ink text-white h-8 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-40"
          >
            Join
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/objects"
            className="text-[10px] font-pixel text-text-dim hover:text-text"
          >
            ← Rooms
          </Link>
          <h2 className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-text-dim">
            {roomId}
          </h2>
        </div>
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

      <div className="flex items-center gap-2 border border-border px-2 h-7">
        <span className="text-[10px] font-pixel text-text-dim truncate flex-1">
          {typeof window !== 'undefined' ? window.location.href : ''}
        </span>
        <button
          onClick={copyLink}
          className="text-[10px] font-pixel text-text-dim hover:text-text shrink-0"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="border border-ink h-72 overflow-y-auto p-3 flex flex-col gap-1.5 bg-white">
        {messages.length === 0 ? (
          <p className="text-[11px] font-pixel text-text-dim m-auto">
            No messages yet. Say something!
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'flex flex-col',
                m.self ? 'items-end' : 'items-start'
              )}
            >
              {!m.self && (
                <span className="text-[9px] font-pixel text-text-dim px-1 mb-0.5">
                  {m.username}
                </span>
              )}
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
