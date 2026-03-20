"use client";

import { useCallback, useState } from "react";
import type { BreakoutRoom } from "@/src/types/socket";
import type { Participant } from "@/src/types/meeting";

interface BreakoutRoomsPanelProps {
  isHost: boolean;
  breakoutRooms: BreakoutRoom[];
  participants: Participant[];
  assignedBreakoutRoom: { breakoutRoomId: string; breakoutRoomName: string } | null;
  selfSocketId: string;
  onCreateRooms: (count: number, cb?: (rooms: BreakoutRoom[]) => void) => void;
  onAssign: (assignments: Record<string, string>) => void;
  onClose: () => void;
  onDismiss: () => void;
}

export function BreakoutRoomsPanel({
  isHost,
  breakoutRooms,
  participants,
  assignedBreakoutRoom,
  selfSocketId,
  onCreateRooms,
  onAssign,
  onClose,
  onDismiss,
}: BreakoutRoomsPanelProps) {
  const [roomCount, setRoomCount] = useState(2);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const unassignedParticipants = participants.filter(
    (p) => p.socketId !== selfSocketId && !assignments[p.socketId],
  );

  const handleAutoAssign = useCallback(() => {
    if (breakoutRooms.length === 0) return;
    const newAssignments: Record<string, string> = {};
    const assignable = participants.filter((p) => p.socketId !== selfSocketId && p.role !== "host");
    assignable.forEach((p, i) => {
      const room = breakoutRooms[i % breakoutRooms.length];
      newAssignments[p.socketId] = room.id;
    });
    setAssignments(newAssignments);
  }, [breakoutRooms, participants, selfSocketId]);

  const handleSendToBreakouts = useCallback(() => {
    if (Object.keys(assignments).length === 0) return;
    onAssign(assignments);
  }, [assignments, onAssign]);

  const assignedCount = Object.keys(assignments).length;

  return (
    <aside className="flex h-full w-80 flex-col bg-zinc-900 text-white">
      <header className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
        <h2 className="text-sm font-semibold">Breakout Rooms</h2>
        <button
          onClick={onDismiss}
          className="rounded p-1 hover:bg-zinc-700"
          aria-label="Close panel"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Attendee view */}
        {!isHost && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-center">
            {assignedBreakoutRoom ? (
              <>
                <p className="text-sm text-zinc-300">You are assigned to</p>
                <p className="mt-1 text-base font-semibold text-blue-400">
                  {assignedBreakoutRoom.breakoutRoomName}
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  The host will move you automatically.
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-400">No breakout room assignment yet.</p>
            )}
          </div>
        )}

        {/* Host view */}
        {isHost && (
          <>
            {breakoutRooms.length === 0 ? (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Number of rooms
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={roomCount}
                    onChange={(e) => setRoomCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                    className="w-20 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-white"
                  />
                  <button
                    onClick={() => onCreateRooms(roomCount)}
                    className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-700"
                  >
                    Create Rooms
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {breakoutRooms.map((room) => {
                    const roomParticipants = participants.filter((p) =>
                      room.participantSocketIds.includes(p.socketId),
                    );
                    return (
                      <div
                        key={room.id}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
                      >
                        <p className="text-xs font-semibold text-zinc-200">{room.name}</p>
                        {roomParticipants.length > 0 ? (
                          <ul className="mt-1 space-y-0.5">
                            {roomParticipants.map((p) => (
                              <li key={p.socketId} className="text-xs text-zinc-400">
                                {p.username}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-zinc-500 italic">Empty</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Assignment section */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Assign participants
                  </label>

                  {unassignedParticipants.map((p) => (
                    <div key={p.socketId} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs text-zinc-300">{p.username}</span>
                      <select
                        value={assignments[p.socketId] || ""}
                        onChange={(e) =>
                          setAssignments((prev) => ({
                            ...prev,
                            [p.socketId]: e.target.value,
                          }))
                        }
                        className="rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-xs text-white"
                      >
                        <option value="">— Room —</option>
                        {breakoutRooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  {unassignedParticipants.length === 0 && assignedCount === 0 && (
                    <p className="text-xs text-zinc-500 italic">No participants to assign.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleAutoAssign}
                    className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs hover:bg-zinc-700"
                  >
                    Auto-assign
                  </button>
                  <button
                    onClick={handleSendToBreakouts}
                    disabled={assignedCount === 0}
                    className="flex-1 rounded bg-blue-600 px-2 py-1.5 text-xs font-medium hover:bg-blue-700 disabled:opacity-40"
                  >
                    Open Rooms ({assignedCount})
                  </button>
                </div>

                <button
                  onClick={onClose}
                  className="w-full rounded bg-red-600 px-3 py-2 text-sm font-medium hover:bg-red-700"
                >
                  Close All Rooms
                </button>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
