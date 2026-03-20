"use client";

import { useMemo } from "react";

import type { ReactionEmoji } from "@/src/types/socket";

type FloatingReactionItem = {
  id: string;
  emoji: ReactionEmoji;
};

type FloatingReactionsProps = {
  reactions: FloatingReactionItem[];
};

function hashToPercent(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return 10 + (Math.abs(hash) % 80);
}

export function FloatingReactions({ reactions }: FloatingReactionsProps) {
  const positioned = useMemo(
    () =>
      reactions.map((reaction) => ({
        ...reaction,
        leftPct: hashToPercent(reaction.id),
      })),
    [reactions],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {positioned.map((reaction) => (
        <div
          key={reaction.id}
          className="absolute bottom-8 text-3xl drop-shadow-lg"
          style={{
            left: `${reaction.leftPct}%`,
            animation: "reactionFloat 1800ms ease-out forwards",
          }}
        >
          {reaction.emoji}
        </div>
      ))}

      <style jsx>{`
        @keyframes reactionFloat {
          0% {
            opacity: 0;
            transform: translateY(0) scale(0.8);
          }
          10% {
            opacity: 1;
            transform: translateY(-12px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-220px) scale(1.25);
          }
        }
      `}</style>
    </div>
  );
}
