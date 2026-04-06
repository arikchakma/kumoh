import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { Section } from '~/components/section';

const ADJECTIVES = [
  'amber',
  'swift',
  'quiet',
  'silver',
  'misty',
  'bright',
  'calm',
  'bold',
  'cool',
  'dark',
  'wild',
  'soft',
  'warm',
  'crisp',
  'deep',
];
const NOUNS = [
  'river',
  'coast',
  'valley',
  'peak',
  'forest',
  'shore',
  'ridge',
  'bay',
  'lake',
  'cliff',
  'field',
  'dune',
  'marsh',
  'cove',
  'grove',
];

function generateRoomId() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(Math.random() * 90) + 10);
  return `${adj}-${noun}-${num}`;
}

const USERNAME_KEY = 'chat-username';

export default function ObjectsLobby() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const roomInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(USERNAME_KEY);
    if (saved) {
      setUsername(saved);
    }
  }, []);

  function saveAndNavigate(id: string) {
    const name = username.trim();
    localStorage.setItem(USERNAME_KEY, name);
    void navigate(`/objects/${id}`, { state: { username: name } });
  }

  function handleCreate() {
    saveAndNavigate(generateRoomId());
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const id = roomId.trim();
    if (!id) {
      return;
    }
    saveAndNavigate(id);
  }

  const nameValid = username.trim().length > 0;

  return (
    <div className="space-y-8">
      <div>
        <Section.Heading>Durable Object Chat</Section.Heading>
        <p className="text-xs font-pixel text-text-dim">
          Each room is a Durable Object — stateful, persistent, and globally
          distributed. Share the room link to invite others.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-[10px] font-pixel text-text-dim uppercase tracking-widest">
          Your name
        </label>
        <input
          type="text"
          placeholder="Enter your name..."
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="border border-border h-8 px-2 text-xs font-pixel w-full"
          maxLength={32}
        />
      </div>

      <div className="space-y-3">
        <button
          onClick={handleCreate}
          disabled={!nameValid}
          className="w-full bg-ink text-white h-8 px-3 text-xs font-pixel hover:opacity-90 disabled:opacity-40"
        >
          Create Room
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-[10px] font-pixel text-text-dim">or join</span>
          <div className="flex-1 border-t border-border" />
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            ref={roomInputRef}
            type="text"
            placeholder="Room ID (e.g. amber-coast-83)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="border border-border h-8 px-2 text-xs font-pixel flex-1"
          />
          <button
            type="submit"
            disabled={!nameValid || !roomId.trim()}
            className="bg-white border border-border text-text h-8 px-3 text-xs font-pixel hover:border-ink disabled:opacity-40"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
