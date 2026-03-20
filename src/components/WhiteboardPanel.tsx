"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type {
  WhiteboardElement,
  WhiteboardPoint,
  WhiteboardShapeKind,
  WhiteboardStickyElement,
  WhiteboardTextElement,
  WhiteboardTodoElement,
  WhiteboardConnectorElement,
  WhiteboardFrameElement,
  WhiteboardCommentElement,
  WhiteboardCursorState,
} from "@/src/types/socket";

type BoardPointerEvent = React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>;

type Tool =
  | "select"
  | "hand"
  | "pen"
  | "highlighter"
  | "eraser"
  | WhiteboardShapeKind
  | "text"
  | "todo"
  | "sticky"
  | "comment"
  | "connector"
  | "frame";

type ResizeCorner = "nw" | "ne" | "sw" | "se";

type RectBounds = { x: number; y: number; width: number; height: number };
type AnchorSide = "top" | "right" | "bottom" | "left";

type HistoryAction =
  | { kind: "add"; after: WhiteboardElement }
  | { kind: "delete"; before: WhiteboardElement }
  | { kind: "update"; before: WhiteboardElement; after: WhiteboardElement };

type InlineEditorState = {
  elementId: string;
  field: "text" | "title" | "subtask";
  subtaskId?: string;
  value: string;
};

interface WhiteboardPanelProps {
  elements: WhiteboardElement[];
  cursors: WhiteboardCursorState[];
  selfSocketId: string;
  selfName: string;
  isHost: boolean;
  onAddElement: (element: WhiteboardElement) => void;
  onUpdateElement: (element: WhiteboardElement) => void;
  onDeleteElement: (elementId: string) => void;
  onClear: () => void;
  onReplaceElements: (elements: WhiteboardElement[]) => void;
  onCursorMove: (x: number, y: number) => void;
  onDismiss: () => void;
}

const COLORS = ["#ffffff", "#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#c084fc", "#f472b6"];
const STICKY_COLORS = ["#fef08a", "#fecaca", "#bfdbfe", "#bbf7d0", "#ddd6fe", "#fdba74"];
const BOARD_WIDTH = 1600;
const BOARD_HEIGHT = 1000;

function distanceToSegment(p: WhiteboardPoint, a: WhiteboardPoint, b: WhiteboardPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}

function getElementBounds(element: WhiteboardElement) {
  if (element.type === "stroke") {
    const xs = element.points.map((p) => p.x);
    const ys = element.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  if (element.type === "shape") {
    const x = Math.min(element.from.x, element.to.x);
    const y = Math.min(element.from.y, element.to.y);
    return {
      x,
      y,
      width: Math.abs(element.to.x - element.from.x),
      height: Math.abs(element.to.y - element.from.y),
    };
  }

  if (element.type === "text") {
    return {
      x: element.at.x,
      y: element.at.y - element.fontSize,
      width: Math.max(120, element.text.length * (element.fontSize * 0.56)),
      height: element.fontSize * 1.4,
    };
  }

  if (element.type === "todo") {
    const subtasks = element.subtasks ?? [];
    const maxSubtaskLength = subtasks.reduce((max, subtask) => Math.max(max, subtask.text.length), 0);
    return {
      x: element.at.x,
      y: element.at.y - element.fontSize,
      width: Math.max(220, Math.max(element.text.length, maxSubtaskLength) * (element.fontSize * 0.56) + 56),
      height: Math.max(element.fontSize * 1.5, (subtasks.length + 1) * (element.fontSize * 1.2) + 14),
    };
  }

  if (element.type === "frame") {
    return {
      x: element.at.x,
      y: element.at.y,
      width: element.width,
      height: element.height,
    };
  }

  if (element.type === "connector") {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  if (element.type === "comment") {
    return {
      x: element.at.x - 8,
      y: element.at.y - 8,
      width: 16,
      height: 16,
    };
  }

  return {
    x: element.at.x,
    y: element.at.y,
    width: element.width,
    height: element.height,
  };
}

function hitTestElement(element: WhiteboardElement, point: WhiteboardPoint) {
  if (element.type === "stroke") {
    for (let i = 1; i < element.points.length; i++) {
      if (distanceToSegment(point, element.points[i - 1], element.points[i]) <= Math.max(6, element.lineWidth + 2)) {
        return true;
      }
    }
    return false;
  }

  if (element.type === "shape") {
    const b = getElementBounds(element);
    if (element.shape === "line" || element.shape === "arrow") {
      return distanceToSegment(point, element.from, element.to) <= Math.max(6, element.lineWidth + 2);
    }
    if (element.shape === "rectangle") {
      return (
        point.x >= b.x - 6 &&
        point.x <= b.x + b.width + 6 &&
        point.y >= b.y - 6 &&
        point.y <= b.y + b.height + 6
      );
    }
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rx = Math.max(1, b.width / 2);
    const ry = Math.max(1, b.height / 2);
    const norm = ((point.x - cx) ** 2) / (rx ** 2) + ((point.y - cy) ** 2) / (ry ** 2);
    return norm <= 1.15;
  }

  if (element.type === "connector") {
    return false;
  }

  const b = getElementBounds(element);
  return point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height;
}

function getElementCenter(element: WhiteboardElement): WhiteboardPoint | null {
  if (element.type === "connector") return null;
  if (element.type === "shape") {
    return {
      x: (element.from.x + element.to.x) / 2,
      y: (element.from.y + element.to.y) / 2,
    };
  }
  if (element.type === "stroke") {
    if (element.points.length === 0) return null;
    const b = getElementBounds(element);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  if (element.type === "text") {
    return { x: element.at.x + Math.max(120, element.text.length * (element.fontSize * 0.56)) / 2, y: element.at.y };
  }
  if (element.type === "todo") {
    return {
      x: element.at.x + getElementBounds(element).width / 2,
      y: element.at.y,
    };
  }
  if (element.type === "sticky" || element.type === "frame") {
    return { x: element.at.x + element.width / 2, y: element.at.y + element.height / 2 };
  }
  if (element.type === "comment") {
    return { x: element.at.x, y: element.at.y };
  }
  return null;
}

function getAnchorSide(from: WhiteboardPoint, to: WhiteboardPoint): AnchorSide {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

function getConnectorAnchor(element: WhiteboardElement, toward: WhiteboardPoint): { point: WhiteboardPoint; side: AnchorSide } | null {
  if (element.type === "connector") return null;
  const b = getElementBounds(element);
  const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const side = getAnchorSide(center, toward);

  if (side === "top") return { side, point: { x: center.x, y: b.y } };
  if (side === "right") return { side, point: { x: b.x + b.width, y: center.y } };
  if (side === "bottom") return { side, point: { x: center.x, y: b.y + b.height } };
  return { side, point: { x: b.x, y: center.y } };
}

function offsetBySide(point: WhiteboardPoint, side: AnchorSide, amount: number): WhiteboardPoint {
  if (side === "top") return { x: point.x, y: point.y - amount };
  if (side === "right") return { x: point.x + amount, y: point.y };
  if (side === "bottom") return { x: point.x, y: point.y + amount };
  return { x: point.x - amount, y: point.y };
}

function compactPoints(points: WhiteboardPoint[]) {
  const compacted: WhiteboardPoint[] = [];
  for (const p of points) {
    const prev = compacted[compacted.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) {
      compacted.push(p);
    }
  }
  return compacted;
}

function segmentIntersectsRect(p1: WhiteboardPoint, p2: WhiteboardPoint, rect: RectBounds) {
  if (p1.x === p2.x) {
    const x = p1.x;
    const yMin = Math.min(p1.y, p2.y);
    const yMax = Math.max(p1.y, p2.y);
    return x >= rect.x && x <= rect.x + rect.width && yMax >= rect.y && yMin <= rect.y + rect.height;
  }
  if (p1.y === p2.y) {
    const y = p1.y;
    const xMin = Math.min(p1.x, p2.x);
    const xMax = Math.max(p1.x, p2.x);
    return y >= rect.y && y <= rect.y + rect.height && xMax >= rect.x && xMin <= rect.x + rect.width;
  }
  return false;
}

function scoreOrthogonalPath(points: WhiteboardPoint[], obstacles: RectBounds[]) {
  let score = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    score += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    for (const rect of obstacles) {
      const inflated = {
        x: rect.x - 14,
        y: rect.y - 14,
        width: rect.width + 28,
        height: rect.height + 28,
      };
      if (segmentIntersectsRect(a, b, inflated)) {
        score += 600;
      }
    }
  }

  score += Math.max(0, points.length - 2) * 10;
  return score;
}

function buildOrthogonalConnectorPoints(
  start: WhiteboardPoint,
  startSide: AnchorSide,
  end: WhiteboardPoint,
  endSide: AnchorSide,
  obstacles: RectBounds[],
) {
  const exitGap = 24;
  const startExit = offsetBySide(start, startSide, exitGap);
  const endEntry = offsetBySide(end, endSide, exitGap);

  const candidates: WhiteboardPoint[][] = [];
  const laneOffsets = [0, 40, -40, 80, -80, 140, -140];

  for (const laneOffset of laneOffsets) {
    const horizontalFirst = compactPoints([
      start,
      startExit,
      { x: (startExit.x + endEntry.x) / 2 + laneOffset, y: startExit.y },
      { x: (startExit.x + endEntry.x) / 2 + laneOffset, y: endEntry.y },
      endEntry,
      end,
    ]);
    const verticalFirst = compactPoints([
      start,
      startExit,
      { x: startExit.x, y: (startExit.y + endEntry.y) / 2 + laneOffset },
      { x: endEntry.x, y: (startExit.y + endEntry.y) / 2 + laneOffset },
      endEntry,
      end,
    ]);
    candidates.push(horizontalFirst, verticalFirst);
  }

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = scoreOrthogonalPath(candidate, obstacles);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function buildOrthogonalConnectorPath(
  start: WhiteboardPoint,
  startSide: AnchorSide,
  end: WhiteboardPoint,
  endSide: AnchorSide,
  obstacles: RectBounds[],
) {
  const points = buildOrthogonalConnectorPoints(start, startSide, end, endSide, obstacles);
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function pathFromPoints(points: WhiteboardPoint[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function nearestSegmentIndex(points: WhiteboardPoint[], point: WhiteboardPoint) {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(point, points[i], points[i + 1]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function resolveConnectorPoints(connector: WhiteboardConnectorElement, allElements: WhiteboardElement[]) {
  const from = allElements.find((item) => item.id === connector.fromElementId);
  const to = allElements.find((item) => item.id === connector.toElementId);
  const fromCenter = from ? getElementCenter(from) : null;
  const toCenter = to ? getElementCenter(to) : null;
  if (!from || !to || !fromCenter || !toCenter) return null;

  const startAnchor = getConnectorAnchor(from, toCenter);
  const endAnchor = getConnectorAnchor(to, fromCenter);
  if (!startAnchor || !endAnchor) return null;

  const start = startAnchor.point;
  const end = endAnchor.point;

  if (connector.waypoints && connector.waypoints.length > 0) {
    const manualPoints = compactPoints([start, ...connector.waypoints, end]);
    return {
      points: manualPoints,
      path: pathFromPoints(manualPoints),
      start,
      end,
    };
  }

  const obstacles = allElements
    .filter((item) => item.type !== "connector" && item.id !== from.id && item.id !== to.id)
    .map((item) => getElementBounds(item))
    .filter((b) => b.width > 0 && b.height > 0);

  const points = buildOrthogonalConnectorPoints(
    startAnchor.point,
    startAnchor.side,
    endAnchor.point,
    endAnchor.side,
    obstacles,
  );

  return {
    points,
    path: pathFromPoints(points),
    start,
    end,
  };
}

function renderPath(points: WhiteboardPoint[]) {
  if (!points.length) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function intersects(a: RectBounds, b: RectBounds) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isElementLocked(element: WhiteboardElement) {
  return element.locked === true;
}
export function WhiteboardPanel({
  elements,
  cursors,
  selfSocketId,
  selfName,
  isHost,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
  onClear,
  onReplaceElements,
  onCursorMove,
  onDismiss,
}: WhiteboardPanelProps) {
  const boardRef = useRef<SVGSVGElement>(null);
  const isDrawing = useRef(false);
  const isDraggingSelection = useRef(false);
  const isPanning = useRef(false);
  const currentStrokePoints = useRef<WhiteboardPoint[]>([]);
  const shapeStartRef = useRef<WhiteboardPoint | null>(null);
  const dragOffsetRef = useRef<WhiteboardPoint | null>(null);
  const panStartScreenRef = useRef<WhiteboardPoint | null>(null);
  const panStartOriginRef = useRef<WhiteboardPoint | null>(null);
  const dragSessionRef = useRef<{
    startPointer: WhiteboardPoint;
    startElements: WhiteboardElement[];
    anchorBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const connectorWaypointDragRef = useRef<{ connectorId: string; waypointIndex: number } | null>(null);
  const marqueeStartRef = useRef<WhiteboardPoint | null>(null);
  const [marqueeBounds, setMarqueeBounds] = useState<RectBounds | null>(null);
  const resizeSessionRef = useRef<{
    corner: ResizeCorner;
    startBounds: { x: number; y: number; width: number; height: number };
    startElements: WhiteboardElement[];
  } | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ffffff");
  const [lineWidth, setLineWidth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [viewOrigin, setViewOrigin] = useState<WhiteboardPoint>({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [connectorStartId, setConnectorStartId] = useState<string | null>(null);
  const [shapePreview, setShapePreview] = useState<WhiteboardElement | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null);
  const [dragTodoSubtask, setDragTodoSubtask] = useState<{ todoId: string; subtaskId: string } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [cursorTrails, setCursorTrails] = useState<Record<string, Array<{ x: number; y: number; t: number }>>>({});
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const inlineEditorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const viewportWidth = BOARD_WIDTH / zoom;
  const viewportHeight = BOARD_HEIGHT / zoom;

  const clampOrigin = useCallback(
    (origin: WhiteboardPoint) => {
      const maxX = Math.max(0, BOARD_WIDTH - viewportWidth);
      const maxY = Math.max(0, BOARD_HEIGHT - viewportHeight);
      return {
        x: Math.max(0, Math.min(maxX, origin.x)),
        y: Math.max(0, Math.min(maxY, origin.y)),
      };
    },
    [viewportHeight, viewportWidth],
  );

  useEffect(() => {
    setViewOrigin((prev) => clampOrigin(prev));
  }, [clampOrigin, zoom]);

  const selectedElement = useMemo(
    () => elements.find((item) => item.id === selectedId) ?? null,
    [elements, selectedId],
  );

  const selectedElements = useMemo(
    () => elements.filter((item) => selectedIds.includes(item.id)),
    [elements, selectedIds],
  );

  const getElementZIndex = useCallback(
    (element: WhiteboardElement) => element.zIndex ?? elements.findIndex((item) => item.id === element.id),
    [elements],
  );

  const sortedElements = useMemo(
    () =>
      [...elements].sort((a, b) => {
        const zDiff = getElementZIndex(a) - getElementZIndex(b);
        if (zDiff !== 0) return zDiff;
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
        return a.id.localeCompare(b.id);
      }),
    [elements, getElementZIndex],
  );

  const selectionBounds = useMemo(() => {
    if (selectedElements.length === 0) return null;
    const bounds = selectedElements.map((item) => getElementBounds(item));
    const x = Math.min(...bounds.map((b) => b.x));
    const y = Math.min(...bounds.map((b) => b.y));
    const right = Math.max(...bounds.map((b) => b.x + b.width));
    const bottom = Math.max(...bounds.map((b) => b.y + b.height));
    return { x, y, width: right - x, height: bottom - y };
  }, [selectedElements]);

  const connectorGeometryMap = useMemo(() => {
    const map = new Map<string, { points: WhiteboardPoint[]; path: string; start: WhiteboardPoint; end: WhiteboardPoint }>();
    for (const element of elements) {
      if (element.type !== "connector") continue;
      const resolved = resolveConnectorPoints(element, elements);
      if (resolved) {
        map.set(element.id, resolved);
      }
    }
    return map;
  }, [elements]);

  const setSingleSelection = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((item) => item !== id);
        setSelectedId(next[0] ?? null);
        return next;
      }
      const next = [...prev, id];
      setSelectedId(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const now = Date.now();
    setCursorTrails((prev) => {
      const next: Record<string, Array<{ x: number; y: number; t: number }>> = { ...prev };
      for (const cursor of cursors) {
        if (cursor.socketId === selfSocketId) continue;
        const history = next[cursor.socketId] ?? [];
        const last = history[history.length - 1];
        if (!last || Math.hypot(last.x - cursor.x, last.y - cursor.y) > 2) {
          history.push({ x: cursor.x, y: cursor.y, t: now });
        }
        next[cursor.socketId] = history.filter((p) => now - p.t < 5000).slice(-16);
      }
      return next;
    });
  }, [cursors, selfSocketId]);

  const canEditElement = useCallback(
    (element: WhiteboardElement | null) => {
      if (!element) return false;
      return (isHost || element.socketId === selfSocketId) && !isElementLocked(element);
    },
    [isHost, selfSocketId],
  );

  const canManageElement = useCallback(
    (element: WhiteboardElement | null) => {
      if (!element) return false;
      return isHost || element.socketId === selfSocketId;
    },
    [isHost, selfSocketId],
  );

  const pushHistory = useCallback((action: HistoryAction) => {
    setUndoStack((prev) => [...prev.slice(-199), action]);
    setRedoStack([]);
  }, []);

  const beginInlineEdit = useCallback(
    (element: WhiteboardElement | null) => {
      if (!element || !canEditElement(element)) return;
      if (
        element.type !== "text" &&
        element.type !== "todo" &&
        element.type !== "sticky" &&
        element.type !== "comment" &&
        element.type !== "frame"
      ) {
        return;
      }

      setInlineEditor({
        elementId: element.id,
        field: element.type === "frame" ? "title" : "text",
        value: element.type === "frame" ? element.title : element.text,
      });
      setSingleSelection(element.id);
    },
    [canEditElement, setSingleSelection],
  );

  const cancelInlineEdit = useCallback(() => {
    setInlineEditor(null);
  }, []);

  const commitInlineEdit = useCallback(() => {
    if (!inlineEditor) return;
    const target = elements.find((item) => item.id === inlineEditor.elementId);
    if (!target || !canEditElement(target)) {
      setInlineEditor(null);
      return;
    }

    let updated: WhiteboardElement | null = null;
    if (target.type === "frame" && inlineEditor.field === "title") {
      updated = { ...target, title: inlineEditor.value, updatedAt: Date.now() };
    } else if (target.type === "todo" && inlineEditor.field === "subtask" && inlineEditor.subtaskId) {
      updated = {
        ...target,
        subtasks: (target.subtasks ?? []).map((subtask) =>
          subtask.id === inlineEditor.subtaskId ? { ...subtask, text: inlineEditor.value } : subtask,
        ),
        updatedAt: Date.now(),
      };
    } else if (
      (target.type === "text" || target.type === "todo" || target.type === "sticky" || target.type === "comment") &&
      inlineEditor.field === "text"
    ) {
      updated = { ...target, text: inlineEditor.value, updatedAt: Date.now() };
    }

    if (updated) {
      let changed = false;
      if (inlineEditor.field === "title" && target.type === "frame" && updated.type === "frame") {
        changed = target.title !== updated.title;
      } else if (
        inlineEditor.field === "text" &&
        (target.type === "text" || target.type === "todo" || target.type === "sticky" || target.type === "comment") &&
        (updated.type === "text" || updated.type === "todo" || updated.type === "sticky" || updated.type === "comment")
      ) {
        changed = target.text !== updated.text;
      } else if (
        inlineEditor.field === "subtask" &&
        target.type === "todo" &&
        updated.type === "todo" &&
        inlineEditor.subtaskId
      ) {
        const beforeSubtask = (target.subtasks ?? []).find((subtask) => subtask.id === inlineEditor.subtaskId);
        const afterSubtask = (updated.subtasks ?? []).find((subtask) => subtask.id === inlineEditor.subtaskId);
        changed = (beforeSubtask?.text ?? "") !== (afterSubtask?.text ?? "");
      }

      if (changed) {
        onUpdateElement(updated);
        pushHistory({ kind: "update", before: target, after: updated });
      }
    }

    setInlineEditor(null);
  }, [canEditElement, elements, inlineEditor, onUpdateElement, pushHistory]);

  useEffect(() => {
    if (!inlineEditor) return;
    const id = window.setTimeout(() => {
      inlineEditorRef.current?.focus();
      inlineEditorRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [inlineEditor]);

  const getNextZIndex = useCallback(
    () => elements.reduce((max, element, index) => Math.max(max, element.zIndex ?? index), -1) + 1,
    [elements],
  );

  const getBoardPoint = useCallback((event: BoardPointerEvent) => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const source = "touches" in event ? event.touches[0] : event;
    if (!source) return null;
    const x = viewOrigin.x + ((source.clientX - rect.left) / rect.width) * viewportWidth;
    const y = viewOrigin.y + ((source.clientY - rect.top) / rect.height) * viewportHeight;
    return { x, y };
  }, [viewOrigin.x, viewOrigin.y, viewportHeight, viewportWidth]);

  const getBoardPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const board = boardRef.current;
      if (!board) return null;
      const rect = board.getBoundingClientRect();
      return {
        x: viewOrigin.x + ((clientX - rect.left) / rect.width) * viewportWidth,
        y: viewOrigin.y + ((clientY - rect.top) / rect.height) * viewportHeight,
      };
    },
    [viewOrigin.x, viewOrigin.y, viewportHeight, viewportWidth],
  );

  const getResizeHandles = useCallback((b: { x: number; y: number; width: number; height: number }) => {
    return {
      nw: { x: b.x, y: b.y },
      ne: { x: b.x + b.width, y: b.y },
      sw: { x: b.x, y: b.y + b.height },
      se: { x: b.x + b.width, y: b.y + b.height },
    };
  }, []);

  const detectResizeCorner = useCallback(
    (point: WhiteboardPoint, b: { x: number; y: number; width: number; height: number }): ResizeCorner | null => {
      const handles = getResizeHandles(b);
      const threshold = 10;
      const corners: ResizeCorner[] = ["nw", "ne", "sw", "se"];
      for (const corner of corners) {
        const h = handles[corner];
        if (Math.hypot(point.x - h.x, point.y - h.y) <= threshold) {
          return corner;
        }
      }
      return null;
    },
    [getResizeHandles],
  );

  const createElementId = useCallback(
    () => `${selfSocketId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [selfSocketId],
  );

  const tryPickElement = useCallback(
    (point: WhiteboardPoint) => {
      for (let i = sortedElements.length - 1; i >= 0; i--) {
        if (hitTestElement(sortedElements[i], point)) {
          return sortedElements[i];
        }
      }
      return null;
    },
    [sortedElements],
  );

  const addTextOrSticky = useCallback(
    (kind: "text" | "todo" | "sticky", at: WhiteboardPoint) => {
      const now = Date.now();

      let element: WhiteboardElement;
      if (kind === "text") {
        element = {
          type: "text",
          id: createElementId(),
          socketId: selfSocketId,
          participantName: selfName,
          color,
          createdAt: now,
          updatedAt: now,
          locked: false,
          zIndex: getNextZIndex(),
          at,
          text: "",
          fontSize: 24,
        } satisfies WhiteboardTextElement;
      } else if (kind === "todo") {
        element = {
          type: "todo",
          id: createElementId(),
          socketId: selfSocketId,
          participantName: selfName,
          color,
          createdAt: now,
          updatedAt: now,
          locked: false,
          zIndex: getNextZIndex(),
          at,
          text: "",
          checked: false,
          fontSize: 22,
          subtasks: [],
        } satisfies WhiteboardTodoElement;
      } else {
        element = {
          type: "sticky",
          id: createElementId(),
          socketId: selfSocketId,
          participantName: selfName,
          color: "#1f2937",
          createdAt: now,
          updatedAt: now,
          locked: false,
          zIndex: getNextZIndex(),
          at,
          width: 220,
          height: 150,
          text: "",
          fillColor: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)],
        } satisfies WhiteboardStickyElement;
      }

      onAddElement(element);
      pushHistory({ kind: "add", after: element });
      setSingleSelection(element.id);
      setInlineEditor({ elementId: element.id, field: "text", value: "" });
    },
    [color, createElementId, getNextZIndex, onAddElement, pushHistory, selfName, selfSocketId, setSingleSelection],
  );

  const translateElement = useCallback((element: WhiteboardElement, dx: number, dy: number): WhiteboardElement => {
    if (element.type === "stroke") {
      return { ...element, points: element.points.map((p) => ({ x: p.x + dx, y: p.y + dy })), updatedAt: Date.now() };
    }
    if (element.type === "shape") {
      return {
        ...element,
        from: { x: element.from.x + dx, y: element.from.y + dy },
        to: { x: element.to.x + dx, y: element.to.y + dy },
        updatedAt: Date.now(),
      };
    }
    if (element.type === "sticky" || element.type === "frame" || element.type === "text" || element.type === "todo" || element.type === "comment") {
      return { ...element, at: { x: element.at.x + dx, y: element.at.y + dy }, updatedAt: Date.now() };
    }
    return { ...element, updatedAt: Date.now() };
  }, []);

  const scalePointFromBounds = useCallback(
    (
      point: WhiteboardPoint,
      fromBounds: { x: number; y: number; width: number; height: number },
      toBounds: { x: number; y: number; width: number; height: number },
    ): WhiteboardPoint => {
      const sx = fromBounds.width > 0 ? toBounds.width / fromBounds.width : 1;
      const sy = fromBounds.height > 0 ? toBounds.height / fromBounds.height : 1;
      return {
        x: toBounds.x + (point.x - fromBounds.x) * sx,
        y: toBounds.y + (point.y - fromBounds.y) * sy,
      };
    },
    [],
  );

  const scaleElementFromBounds = useCallback(
    (
      element: WhiteboardElement,
      fromBounds: { x: number; y: number; width: number; height: number },
      toBounds: { x: number; y: number; width: number; height: number },
    ): WhiteboardElement => {
      if (element.type === "connector") return { ...element, updatedAt: Date.now() };

      if (element.type === "stroke") {
        return {
          ...element,
          points: element.points.map((p) => scalePointFromBounds(p, fromBounds, toBounds)),
          updatedAt: Date.now(),
        };
      }

      if (element.type === "shape") {
        return {
          ...element,
          from: scalePointFromBounds(element.from, fromBounds, toBounds),
          to: scalePointFromBounds(element.to, fromBounds, toBounds),
          updatedAt: Date.now(),
        };
      }

      if (element.type === "sticky" || element.type === "frame") {
        const topLeft = scalePointFromBounds(element.at, fromBounds, toBounds);
        const bottomRight = scalePointFromBounds(
          { x: element.at.x + element.width, y: element.at.y + element.height },
          fromBounds,
          toBounds,
        );
        return {
          ...element,
          at: topLeft,
          width: Math.max(20, bottomRight.x - topLeft.x),
          height: Math.max(20, bottomRight.y - topLeft.y),
          updatedAt: Date.now(),
        };
      }

      if (element.type === "text") {
        const at = scalePointFromBounds(element.at, fromBounds, toBounds);
        const scaleY = fromBounds.height > 0 ? toBounds.height / fromBounds.height : 1;
        return {
          ...element,
          at,
          fontSize: Math.max(10, Math.min(72, Math.round(element.fontSize * scaleY))),
          updatedAt: Date.now(),
        };
      }

      if (element.type === "todo") {
        const at = scalePointFromBounds(element.at, fromBounds, toBounds);
        const scaleY = fromBounds.height > 0 ? toBounds.height / fromBounds.height : 1;
        return {
          ...element,
          at,
          fontSize: Math.max(10, Math.min(72, Math.round(element.fontSize * scaleY))),
          updatedAt: Date.now(),
        };
      }

      return {
        ...element,
        at: scalePointFromBounds(element.at, fromBounds, toBounds),
        updatedAt: Date.now(),
      };
    },
    [scalePointFromBounds],
  );

  const startPointer = useCallback(
    (event: BoardPointerEvent) => {
      event.preventDefault();
      const point = getBoardPoint(event);
      if (!point) return;

      if (tool === "hand") {
        const src = "touches" in event ? event.touches[0] : event;
        if (!src) return;
        isPanning.current = true;
        panStartScreenRef.current = { x: src.clientX, y: src.clientY };
        panStartOriginRef.current = { ...viewOrigin };
        return;
      }

      if (tool === "comment") {
        const now = Date.now();
        const comment: WhiteboardCommentElement = {
          type: "comment",
          id: createElementId(),
          socketId: selfSocketId,
          participantName: selfName,
          color: "#f59e0b",
          createdAt: now,
          updatedAt: now,
          locked: false,
          zIndex: getNextZIndex(),
          at: point,
          text: "",
          resolved: false,
          replies: [],
        };
        onAddElement(comment);
        pushHistory({ kind: "add", after: comment });
        setSingleSelection(comment.id);
        setInlineEditor({ elementId: comment.id, field: "text", value: "" });
        return;
      }

      if (tool === "text" || tool === "todo" || tool === "sticky") {
        addTextOrSticky(tool, point);
        return;
      }

      if (tool === "connector") {
        const hit = tryPickElement(point);
        if (!hit || hit.type === "connector") return;
        if (!connectorStartId) {
          setConnectorStartId(hit.id);
          setSingleSelection(hit.id);
          return;
        }

        if (connectorStartId === hit.id) {
          setConnectorStartId(null);
          return;
        }

        const now = Date.now();
        const connector: WhiteboardConnectorElement = {
          type: "connector",
          id: createElementId(),
          socketId: selfSocketId,
          participantName: selfName,
          color,
          createdAt: now,
          updatedAt: now,
          locked: false,
          zIndex: getNextZIndex(),
          fromElementId: connectorStartId,
          toElementId: hit.id,
          lineWidth,
        };
        onAddElement(connector);
        pushHistory({ kind: "add", after: connector });
        setConnectorStartId(null);
        setSingleSelection(connector.id);
        return;
      }

      if (tool === "select") {
        if (selectedElement?.type === "connector" && canEditElement(selectedElement)) {
          const geom = connectorGeometryMap.get(selectedElement.id);
          if (geom && geom.points.length >= 3) {
            const internal = geom.points.slice(1, -1);
            let closestIdx = -1;
            let bestDist = Number.POSITIVE_INFINITY;
            for (let i = 0; i < internal.length; i++) {
              const d = Math.hypot(point.x - internal[i].x, point.y - internal[i].y);
              if (d < bestDist) {
                bestDist = d;
                closestIdx = i;
              }
            }

            if (closestIdx >= 0 && bestDist <= 10) {
              const existingWaypoints = selectedElement.waypoints?.slice() ?? internal;
              if (!selectedElement.waypoints) {
                onUpdateElement({ ...selectedElement, waypoints: existingWaypoints, updatedAt: Date.now() });
              }
              connectorWaypointDragRef.current = {
                connectorId: selectedElement.id,
                waypointIndex: closestIdx,
              };
              return;
            }
          }
        }

        const activeBounds = selectionBounds;
        if (activeBounds && selectedElements.length > 0) {
          const allResizable = selectedElements.every(
            (item) => item.type === "shape" || item.type === "sticky" || item.type === "frame",
          );
          const allEditable = selectedElements.every((item) => canEditElement(item));
          const b = activeBounds;
          const corner = detectResizeCorner(point, b);
          if (corner && allResizable && allEditable) {
            resizeSessionRef.current = {
              corner,
              startBounds: b,
              startElements: selectedElements,
            };
            return;
          }
        }

        const hit = tryPickElement(point);
        const additive = "shiftKey" in event && event.shiftKey;
        if (hit?.id && additive) {
          toggleSelection(hit.id);
        } else {
          setSingleSelection(hit?.id ?? null);
        }

        if (!hit) {
          marqueeStartRef.current = point;
          setMarqueeBounds({ x: point.x, y: point.y, width: 0, height: 0 });
          return;
        }

        if (hit && canEditElement(hit)) {
          const selectionForDrag =
            selectedIds.includes(hit.id) && !additive
              ? elements.filter((item) => selectedIds.includes(item.id))
              : [hit];
          const editableSelection = selectionForDrag.filter((item) => canEditElement(item));
          if (editableSelection.length === 0) return;

          const bounds = editableSelection.map((item) => getElementBounds(item));
          const bx = Math.min(...bounds.map((b) => b.x));
          const by = Math.min(...bounds.map((b) => b.y));
          const br = Math.max(...bounds.map((b) => b.x + b.width));
          const bb = Math.max(...bounds.map((b) => b.y + b.height));
          const b = { x: bx, y: by, width: br - bx, height: bb - by };

          if (!selectedIds.includes(hit.id) || additive) {
            if (!additive) {
              setSingleSelection(hit.id);
            }
          }

          isDraggingSelection.current = true;
          dragOffsetRef.current = { x: point.x - b.x, y: point.y - b.y };
          dragSessionRef.current = {
            startPointer: point,
            startElements: editableSelection,
            anchorBounds: b,
          };
        }
        return;
      }

      if (tool === "eraser") {
        const hit = tryPickElement(point);
        if (hit && canEditElement(hit)) {
          onDeleteElement(hit.id);
          pushHistory({ kind: "delete", before: hit });
          if (selectedIds.includes(hit.id)) {
            const next = selectedIds.filter((id) => id !== hit.id);
            setSelectedIds(next);
            setSelectedId(next[0] ?? null);
          }
        }
        return;
      }

      if (tool === "pen" || tool === "highlighter") {
        isDrawing.current = true;
        currentStrokePoints.current = [point];
        return;
      }

      shapeStartRef.current = point;
      const now = Date.now();
      if (tool === "frame") {
        setShapePreview({
          type: "frame",
          id: "preview-shape",
          socketId: selfSocketId,
          participantName: selfName,
          color,
          createdAt: now,
          updatedAt: now,
          locked: false,
          zIndex: getNextZIndex(),
          at: point,
          width: 1,
          height: 1,
          title: "Section",
        } satisfies WhiteboardFrameElement);
      } else {
        setShapePreview({
          type: "shape",
          shape: tool as WhiteboardShapeKind,
          id: "preview-shape",
          socketId: selfSocketId,
          participantName: selfName,
          color,
          createdAt: now,
          updatedAt: now,
          locked: false,
          zIndex: getNextZIndex(),
          from: point,
          to: point,
          lineWidth,
        });
      }
    },
    [
      addTextOrSticky,
      canEditElement,
      color,
      connectorGeometryMap,
      createElementId,
      detectResizeCorner,
      elements,
      getNextZIndex,
      getBoardPoint,
      lineWidth,
      onAddElement,
      onDeleteElement,
      onUpdateElement,
      pushHistory,
      selectedElement,
      selectedElements,
      selectedIds,
      selectionBounds,
      setSingleSelection,
      selfName,
      selfSocketId,
      tool,
      toggleSelection,
      tryPickElement,
      viewOrigin,
    ],
  );

  const movePointer = useCallback(
    (event: BoardPointerEvent) => {
      const point = getBoardPoint(event);
      if (!point) return;

      if (isPanning.current) {
        event.preventDefault();
        const src = "touches" in event ? event.touches[0] : event;
        const startScreen = panStartScreenRef.current;
        const startOrigin = panStartOriginRef.current;
        const rect = boardRef.current?.getBoundingClientRect();
        if (!src || !startScreen || !startOrigin || !rect) return;
        const dxBoard = ((src.clientX - startScreen.x) / rect.width) * viewportWidth;
        const dyBoard = ((src.clientY - startScreen.y) / rect.height) * viewportHeight;
        setViewOrigin(clampOrigin({ x: startOrigin.x - dxBoard, y: startOrigin.y - dyBoard }));
        return;
      }

      if (connectorWaypointDragRef.current) {
        event.preventDefault();
        const session = connectorWaypointDragRef.current;
        const connector = elements.find(
          (item): item is WhiteboardConnectorElement =>
            item.type === "connector" && item.id === session.connectorId,
        );
        if (!connector || !canEditElement(connector)) return;

        const currentWaypoints = connector.waypoints?.slice() ?? [];
        if (session.waypointIndex < 0 || session.waypointIndex >= currentWaypoints.length) return;
        currentWaypoints[session.waypointIndex] = { x: point.x, y: point.y };
        onUpdateElement({ ...connector, waypoints: currentWaypoints, updatedAt: Date.now() });
        return;
      }

      if (resizeSessionRef.current) {
        event.preventDefault();
        const session = resizeSessionRef.current;
        const b = session.startBounds;
        let left = b.x;
        let top = b.y;
        let right = b.x + b.width;
        let bottom = b.y + b.height;

        if (session.corner.includes("n")) top = point.y;
        if (session.corner.includes("s")) bottom = point.y;
        if (session.corner.includes("w")) left = point.x;
        if (session.corner.includes("e")) right = point.x;

        const nx = Math.min(left, right);
        const ny = Math.min(top, bottom);
        const nw = Math.max(20, Math.abs(right - left));
        const nh = Math.max(20, Math.abs(bottom - top));

        const resizedBounds = { x: nx, y: ny, width: nw, height: nh };
        for (const item of session.startElements) {
          if (!canEditElement(item)) continue;
          const scaled = scaleElementFromBounds(item, session.startBounds, resizedBounds);
          onUpdateElement(scaled);
        }
        return;
      }

      if (isDrawing.current) {
        event.preventDefault();
        currentStrokePoints.current.push(point);
        return;
      }

      if (marqueeStartRef.current) {
        event.preventDefault();
        const start = marqueeStartRef.current;
        setMarqueeBounds({
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          width: Math.abs(point.x - start.x),
          height: Math.abs(point.y - start.y),
        });
        onCursorMove(point.x, point.y);
        return;
      }

      if (isDraggingSelection.current && dragSessionRef.current) {
        event.preventDefault();
        const session = dragSessionRef.current;
        const dx = point.x - session.startPointer.x;
        const dy = point.y - session.startPointer.y;
        for (const item of session.startElements) {
          if (!canEditElement(item)) continue;
          const moved = translateElement(item, dx, dy);
          onUpdateElement(moved);
        }
        return;
      }

      onCursorMove(point.x, point.y);

      if (shapeStartRef.current && shapePreview?.type === "shape") {
        event.preventDefault();
        setShapePreview((prev) =>
          prev && prev.type === "shape"
            ? {
                ...prev,
                to: point,
                updatedAt: Date.now(),
              }
            : prev,
        );
      }

      if (shapeStartRef.current && shapePreview?.type === "frame") {
        event.preventDefault();
        const start = shapeStartRef.current;
        setShapePreview((prev) =>
          prev && prev.type === "frame"
            ? {
                ...prev,
                at: { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y) },
                width: Math.max(1, Math.abs(point.x - start.x)),
                height: Math.max(1, Math.abs(point.y - start.y)),
                updatedAt: Date.now(),
              }
            : prev,
        );
      }
    },
    [
      canEditElement,
      clampOrigin,
      elements,
      getNextZIndex,
      getBoardPoint,
      onCursorMove,
      onUpdateElement,
      scaleElementFromBounds,
      shapePreview,
      translateElement,
      viewportHeight,
      viewportWidth,
    ],
  );

  const endPointer = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      panStartOriginRef.current = null;
      panStartScreenRef.current = null;
      return;
    }

    if (connectorWaypointDragRef.current) {
      connectorWaypointDragRef.current = null;
      return;
    }

    if (resizeSessionRef.current) {
      const session = resizeSessionRef.current;
      resizeSessionRef.current = null;
      for (const before of session.startElements) {
        const after = elements.find((item) => item.id === before.id);
        if (after && JSON.stringify(after) !== JSON.stringify(before)) {
          pushHistory({ kind: "update", before, after });
        }
      }
      return;
    }

    if (isDraggingSelection.current) {
      isDraggingSelection.current = false;
      dragOffsetRef.current = null;
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      if (session) {
        for (const before of session.startElements) {
          const after = elements.find((item) => item.id === before.id);
          if (after && JSON.stringify(after) !== JSON.stringify(before)) {
            pushHistory({ kind: "update", before, after });
          }
        }
      }
      return;
    }

    if (marqueeStartRef.current) {
      const box = marqueeBounds;
      marqueeStartRef.current = null;
      setMarqueeBounds(null);
      if (box && box.width > 2 && box.height > 2) {
        const ids = elements
          .filter((item) => item.type !== "connector")
          .filter((item) => intersects(box, getElementBounds(item)))
          .map((item) => item.id);
        setSelectedIds(ids);
        setSelectedId(ids[0] ?? null);
      }
      return;
    }

    if (isDrawing.current) {
      isDrawing.current = false;
      const points = currentStrokePoints.current;
      currentStrokePoints.current = [];
      if (points.length < 2) return;

      const now = Date.now();
      const stroke: WhiteboardElement = {
        type: "stroke",
        id: createElementId(),
        socketId: selfSocketId,
        participantName: selfName,
        color: tool === "eraser" ? "#18181b" : color,
        createdAt: now,
        updatedAt: now,
        locked: false,
        zIndex: getNextZIndex(),
        points,
        lineWidth,
        opacity: tool === "highlighter" ? 0.4 : 1,
      };

      onAddElement(stroke);
      pushHistory({ kind: "add", after: stroke });
      return;
    }

    if (shapeStartRef.current && (shapePreview?.type === "shape" || shapePreview?.type === "frame")) {
      const candidate = { ...shapePreview, id: createElementId() };
      const b = getElementBounds(candidate);
      shapeStartRef.current = null;
      setShapePreview(null);
      if (b.width < 4 && b.height < 4) return;
      onAddElement(candidate);
      pushHistory({ kind: "add", after: candidate });
    }
  }, [color, createElementId, elements, getNextZIndex, lineWidth, marqueeBounds, onAddElement, pushHistory, selfName, selfSocketId, shapePreview, tool]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const baseDeletable = elements.filter((item) => selectedIds.includes(item.id) && canEditElement(item));
    const baseIds = new Set(baseDeletable.map((item) => item.id));
    const linkedConnectors = elements.filter(
      (item) =>
        item.type === "connector" &&
        (baseIds.has(item.fromElementId) || baseIds.has(item.toElementId)) &&
        canEditElement(item),
    );
    const deletable = [...baseDeletable, ...linkedConnectors];
    if (deletable.length === 0) return;
    for (const item of deletable) {
      onDeleteElement(item.id);
      pushHistory({ kind: "delete", before: item });
    }
    setSingleSelection(null);
  }, [canEditElement, elements, onDeleteElement, pushHistory, selectedIds, setSingleSelection]);

  const editSelectedText = useCallback(() => {
    if (!selectedElement || !canEditElement(selectedElement)) return;
    if (selectedElement.type !== "text" && selectedElement.type !== "todo" && selectedElement.type !== "sticky" && selectedElement.type !== "frame" && selectedElement.type !== "comment") return;
    beginInlineEdit(selectedElement);
  }, [beginInlineEdit, canEditElement, selectedElement]);

  const toggleTodoChecked = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "todo" || !canEditElement(selectedElement)) return;
    const updated = { ...selectedElement, checked: !selectedElement.checked, updatedAt: Date.now() };
    onUpdateElement(updated);
    pushHistory({ kind: "update", before: selectedElement, after: updated });
  }, [canEditElement, onUpdateElement, pushHistory, selectedElement]);

  const addTodoSubtask = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "todo" || !canEditElement(selectedElement)) return;
    const newSubtask = {
      id: `${selectedElement.id}-sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: "",
      checked: false,
    };
    const updated = { ...selectedElement, subtasks: [...(selectedElement.subtasks ?? []), newSubtask], updatedAt: Date.now() };
    onUpdateElement(updated);
    pushHistory({ kind: "update", before: selectedElement, after: updated });
    setInlineEditor({
      elementId: selectedElement.id,
      field: "subtask",
      subtaskId: newSubtask.id,
      value: "",
    });
  }, [canEditElement, onUpdateElement, pushHistory, selectedElement]);

  const toggleTodoSubtaskChecked = useCallback(
    (todo: WhiteboardTodoElement, subtaskId: string) => {
      if (!canEditElement(todo)) return;
      const updated = {
        ...todo,
        subtasks: (todo.subtasks ?? []).map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, checked: !subtask.checked } : subtask,
        ),
        updatedAt: Date.now(),
      };
      onUpdateElement(updated);
      pushHistory({ kind: "update", before: todo, after: updated });
    },
    [canEditElement, onUpdateElement, pushHistory],
  );

  const removeTodoSubtask = useCallback(
    (todo: WhiteboardTodoElement, subtaskId: string) => {
      if (!canEditElement(todo)) return;
      const updated = {
        ...todo,
        subtasks: (todo.subtasks ?? []).filter((subtask) => subtask.id !== subtaskId),
        updatedAt: Date.now(),
      };
      onUpdateElement(updated);
      pushHistory({ kind: "update", before: todo, after: updated });
    },
    [canEditElement, onUpdateElement, pushHistory],
  );

  const reorderTodoSubtask = useCallback(
    (todo: WhiteboardTodoElement, sourceSubtaskId: string, targetSubtaskId: string) => {
      if (!canEditElement(todo) || sourceSubtaskId === targetSubtaskId) return;
      const existingSubtasks = todo.subtasks ?? [];
      const fromIndex = existingSubtasks.findIndex((subtask) => subtask.id === sourceSubtaskId);
      const toIndex = existingSubtasks.findIndex((subtask) => subtask.id === targetSubtaskId);
      if (fromIndex < 0 || toIndex < 0) return;

      const reordered = existingSubtasks.slice();
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      const updated = { ...todo, subtasks: reordered, updatedAt: Date.now() };
      onUpdateElement(updated);
      pushHistory({ kind: "update", before: todo, after: updated });
    },
    [canEditElement, onUpdateElement, pushHistory],
  );

  const toggleCommentResolved = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "comment" || !canEditElement(selectedElement)) return;
    const updated = { ...selectedElement, resolved: !selectedElement.resolved, updatedAt: Date.now() };
    onUpdateElement(updated);
    pushHistory({ kind: "update", before: selectedElement, after: updated });
  }, [canEditElement, onUpdateElement, pushHistory, selectedElement]);

  const addCommentReply = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "comment" || !canEditElement(selectedElement)) return;
    const text = window.prompt("Reply", "");
    if (!text || !text.trim()) return;
    const reply = {
      id: `${selfSocketId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: selfName,
      text: text.trim(),
      createdAt: Date.now(),
    };
    const updated = {
      ...selectedElement,
      replies: [...selectedElement.replies, reply],
      updatedAt: Date.now(),
      resolved: false,
    };
    onUpdateElement(updated);
    pushHistory({ kind: "update", before: selectedElement, after: updated });
  }, [canEditElement, onUpdateElement, pushHistory, selectedElement, selfName, selfSocketId]);

  const resetConnectorRoute = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "connector" || !canEditElement(selectedElement)) return;
    const updated = { ...selectedElement, waypoints: [], updatedAt: Date.now() };
    onUpdateElement(updated);
    pushHistory({ kind: "update", before: selectedElement, after: updated });
  }, [canEditElement, onUpdateElement, pushHistory, selectedElement]);

  const toggleSelectionLock = useCallback(() => {
    const manageable = selectedElements.filter((item) => canManageElement(item));
    if (manageable.length === 0) return;
    const shouldLock = manageable.some((item) => !isElementLocked(item));
    for (const item of manageable) {
      const updated = { ...item, locked: shouldLock, updatedAt: Date.now() };
      onUpdateElement(updated);
      pushHistory({ kind: "update", before: item, after: updated });
    }
  }, [canManageElement, onUpdateElement, pushHistory, selectedElements]);

  const updateSelectionZOrder = useCallback(
    (direction: "front" | "forward" | "backward" | "back") => {
      const manageableIds = new Set(selectedElements.filter((item) => canManageElement(item)).map((item) => item.id));
      if (manageableIds.size === 0) return;

      const ordered = [...sortedElements];
      if (direction === "front") {
        ordered.sort((a, b) => Number(manageableIds.has(a.id)) - Number(manageableIds.has(b.id)));
      } else if (direction === "back") {
        ordered.sort((a, b) => Number(manageableIds.has(b.id)) - Number(manageableIds.has(a.id)));
      } else if (direction === "forward") {
        for (let index = ordered.length - 2; index >= 0; index--) {
          if (manageableIds.has(ordered[index].id) && !manageableIds.has(ordered[index + 1].id)) {
            [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
          }
        }
      } else {
        for (let index = 1; index < ordered.length; index++) {
          if (manageableIds.has(ordered[index].id) && !manageableIds.has(ordered[index - 1].id)) {
            [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]];
          }
        }
      }

      ordered.forEach((item, index) => {
        const before = elements.find((element) => element.id === item.id);
        if (!before) return;
        const previousZ = before.zIndex ?? elements.findIndex((element) => element.id === before.id);
        if (previousZ === index) return;
        const updated = { ...before, zIndex: index, updatedAt: Date.now() };
        onUpdateElement(updated);
        pushHistory({ kind: "update", before, after: updated });
      });
    },
    [canManageElement, elements, onUpdateElement, pushHistory, selectedElements, sortedElements],
  );

  const setStickyFillColor = useCallback(
    (fillColor: string) => {
      if (!selectedElement || selectedElement.type !== "sticky" || !canEditElement(selectedElement)) return;
      const updated = { ...selectedElement, fillColor, updatedAt: Date.now() };
      onUpdateElement(updated);
      pushHistory({ kind: "update", before: selectedElement, after: updated });
    },
    [canEditElement, onUpdateElement, pushHistory, selectedElement],
  );

  const resizeSticky = useCallback(
    (size: "sm" | "md" | "lg") => {
      if (!selectedElement || selectedElement.type !== "sticky" || !canEditElement(selectedElement)) return;
      const dimensions =
        size === "sm" ? { width: 180, height: 120 } : size === "lg" ? { width: 300, height: 220 } : { width: 220, height: 150 };
      const updated = { ...selectedElement, ...dimensions, updatedAt: Date.now() };
      onUpdateElement(updated);
      pushHistory({ kind: "update", before: selectedElement, after: updated });
    },
    [canEditElement, onUpdateElement, pushHistory, selectedElement],
  );

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ elements }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elements]);

  const exportPng = useCallback(() => {
    const svg = boardRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = BOARD_WIDTH;
      canvas.height = BOARD_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#27272a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `whiteboard-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const importJson = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { elements?: WhiteboardElement[] };
      if (!parsed.elements || !Array.isArray(parsed.elements)) {
        return;
      }
      onReplaceElements(parsed.elements);
      setSingleSelection(null);
      setUndoStack([]);
      setRedoStack([]);
    } catch {
      // ignore malformed import
    }
  }, [onReplaceElements, setSingleSelection]);

  const handleElementClick = useCallback(
    (event: React.MouseEvent<SVGElement>, elementId: string) => {
      event.stopPropagation();
      if (event.shiftKey) {
        toggleSelection(elementId);
      } else {
        setSingleSelection(elementId);
      }
    },
    [setSingleSelection, toggleSelection],
  );

  const doUndo = useCallback(() => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, action]);

    if (action.kind === "add") {
      onDeleteElement(action.after.id);
      return;
    }
    if (action.kind === "delete") {
      onAddElement(action.before);
      return;
    }
    onUpdateElement(action.before);
  }, [onAddElement, onDeleteElement, onUpdateElement, undoStack]);

  const doRedo = useCallback(() => {
    const action = redoStack[redoStack.length - 1];
    if (!action) return;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, action]);

    if (action.kind === "add") {
      onAddElement(action.after);
      return;
    }
    if (action.kind === "delete") {
      onDeleteElement(action.before.id);
      return;
    }
    onUpdateElement(action.after);
  }, [onAddElement, onDeleteElement, onUpdateElement, redoStack]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (inlineEditor) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelInlineEdit();
        }
        return;
      }

      const z = event.key.toLowerCase() === "z";
      const y = event.key.toLowerCase() === "y";
      if ((event.ctrlKey || event.metaKey) && z && !event.shiftKey) {
        event.preventDefault();
        doUndo();
      } else if ((event.ctrlKey || event.metaKey) && (y || (z && event.shiftKey))) {
        event.preventDefault();
        doRedo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedElement) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelInlineEdit, deleteSelected, doRedo, doUndo, inlineEditor, selectedElement]);

  const visibleElements = useMemo(() => {
    const next = shapePreview ? [...sortedElements, shapePreview] : [...sortedElements];
    return next.sort((a, b) => {
      const aZ = a.id === "preview-shape" ? Number.MAX_SAFE_INTEGER : getElementZIndex(a);
      const bZ = b.id === "preview-shape" ? Number.MAX_SAFE_INTEGER : getElementZIndex(b);
      if (aZ !== bZ) return aZ - bZ;
      return a.createdAt - b.createdAt;
    });
  }, [getElementZIndex, shapePreview, sortedElements]);

  const hasSelectedElements = selectedElements.length > 0;
  const canManageSelection = hasSelectedElements && selectedElements.every((item) => canManageElement(item));
  const allSelectedLocked = hasSelectedElements && selectedElements.every((item) => isElementLocked(item));

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900 text-white">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-700 px-4 py-2">
        <span className="mr-2 text-sm font-semibold">Whiteboard</span>

        {([
          ["select", "Select"],
          ["hand", "Hand"],
          ["pen", "Pen"],
          ["highlighter", "High"],
          ["eraser", "Erase"],
          ["line", "Line"],
          ["rectangle", "Rect"],
          ["ellipse", "Ellipse"],
          ["arrow", "Arrow"],
          ["connector", "Link"],
          ["frame", "Frame"],
          ["text", "Text"],
          ["todo", "Todo"],
          ["sticky", "Sticky"],
          ["comment", "Comment"],
        ] as Array<[Tool, string]>).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTool(value)}
            className={`rounded border px-2 py-1 text-xs ${tool === value ? "border-cyan-300 bg-cyan-500/20 text-cyan-100" : "border-zinc-600 bg-zinc-800 text-zinc-300"}`}
          >
            {label}
          </button>
        ))}

        <div className="mx-2 h-5 w-px bg-zinc-700" />

        {/* Color picker */}
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>

        <select
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          className="rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-xs text-white"
        >
          <option value={2}>Thin</option>
          <option value={4}>Medium</option>
          <option value={8}>Thick</option>
          <option value={14}>Bold</option>
        </select>

        <button
          onClick={doUndo}
          disabled={undoStack.length === 0}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Undo
        </button>

        <button
          onClick={doRedo}
          disabled={redoStack.length === 0}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Redo
        </button>

        <button
          onClick={editSelectedText}
          disabled={!selectedElement || (selectedElement.type !== "text" && selectedElement.type !== "todo" && selectedElement.type !== "sticky" && selectedElement.type !== "frame" && selectedElement.type !== "comment")}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Edit Text
        </button>

        {selectedElement?.type === "todo" && (
          <>
            <button
              onClick={toggleTodoChecked}
              className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700"
            >
              {selectedElement.checked ? "Uncheck" : "Check"}
            </button>
            <button
              onClick={addTodoSubtask}
              className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700"
            >
              Add Subtask
            </button>
          </>
        )}

        <button
          onClick={toggleSelectionLock}
          disabled={!canManageSelection}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          {allSelectedLocked ? "Unlock" : "Lock"}
        </button>

        <button
          onClick={() => updateSelectionZOrder("back")}
          disabled={!canManageSelection}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Send Back
        </button>

        <button
          onClick={() => updateSelectionZOrder("backward")}
          disabled={!canManageSelection}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Backward
        </button>

        <button
          onClick={() => updateSelectionZOrder("forward")}
          disabled={!canManageSelection}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Forward
        </button>

        <button
          onClick={() => updateSelectionZOrder("front")}
          disabled={!canManageSelection}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Bring Front
        </button>

        {selectedElement?.type === "comment" && (
          <>
            <button
              onClick={addCommentReply}
              className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700"
            >
              Reply
            </button>
            <button
              onClick={toggleCommentResolved}
              className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700"
            >
              {selectedElement.resolved ? "Mark Open" : "Mark Resolved"}
            </button>
          </>
        )}

        {selectedElement?.type === "connector" && (
          <button
            onClick={resetConnectorRoute}
            className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700"
          >
            Reset Auto Route
          </button>
        )}

        {selectedElement?.type === "sticky" && (
          <>
            <div className="mx-1 h-5 w-px bg-zinc-700" />
            <span className="text-xs text-zinc-400">Sticky</span>
            <button onClick={() => resizeSticky("sm")} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700">S</button>
            <button onClick={() => resizeSticky("md")} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700">M</button>
            <button onClick={() => resizeSticky("lg")} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700">L</button>
            <div className="flex gap-1">
              {STICKY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setStickyFillColor(c)}
                  style={{ background: c }}
                  className="h-4 w-4 rounded border border-zinc-500"
                  aria-label={`Sticky ${c}`}
                />
              ))}
            </div>
          </>
        )}

        <button
          onClick={deleteSelected}
          disabled={!selectedElement}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Delete
        </button>

        {isHost && (
          <button
            onClick={onClear}
            className="rounded border border-red-700 px-2 py-1 text-xs text-red-400 hover:bg-red-900/40"
          >
            Clear all
          </button>
        )}

        <button onClick={exportJson} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700">Export JSON</button>
        <button onClick={exportPng} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700">Export PNG</button>
        <button
          onClick={() => importInputRef.current?.click()}
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700"
        >
          Import JSON
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void importJson(file);
            }
            e.currentTarget.value = "";
          }}
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-400">Zoom</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </div>

        <button onClick={onDismiss} className="rounded p-1 hover:bg-zinc-700" aria-label="Close whiteboard">
          ✕
        </button>
      </header>

      {/* Board */}
      <div className="relative flex-1 overflow-hidden bg-zinc-800">
        <svg
          ref={boardRef}
          viewBox={`${viewOrigin.x} ${viewOrigin.y} ${viewportWidth} ${viewportHeight}`}
          className="h-full w-full touch-none"
          onMouseDown={startPointer}
          onMouseMove={movePointer}
          onMouseUp={endPointer}
          onMouseLeave={endPointer}
          onTouchStart={startPointer}
          onTouchMove={movePointer}
          onTouchEnd={endPointer}
        >
          {tool === "connector" && connectorStartId && (
            <text x={viewOrigin.x + 16} y={viewOrigin.y + 26} fontSize={14} fill="#67e8f9" fontWeight={700}>
              Connector: select target element
            </text>
          )}
          <defs>
            <marker id="arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill={color} />
            </marker>
          </defs>

          {/* subtle dot grid */}
          {Array.from({ length: 75 }).map((_, row) =>
            Array.from({ length: 120 }).map((__, col) => (
              <circle
                key={`${row}-${col}`}
                cx={col * 16 + 8}
                cy={row * 16 + 8}
                r={0.6}
                fill="#3f3f46"
                opacity={0.45}
              />
            )),
          )}

          {visibleElements.map((element) => {
            const isSelected = selectedId === element.id;
            if (element.type === "stroke") {
              return (
                <path
                  key={element.id}
                  d={renderPath(element.points)}
                  stroke={element.color}
                  strokeOpacity={element.opacity}
                  strokeWidth={element.lineWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onClick={(e) => handleElementClick(e, element.id)}
                />
              );
            }

            if (element.type === "shape") {
              const b = getElementBounds(element);
              if (element.shape === "line" || element.shape === "arrow") {
                return (
                  <line
                    key={element.id}
                    x1={element.from.x}
                    y1={element.from.y}
                    x2={element.to.x}
                    y2={element.to.y}
                    stroke={element.color}
                    strokeWidth={element.lineWidth}
                    markerEnd={element.shape === "arrow" ? "url(#arrow-head)" : undefined}
                    onClick={(e) => handleElementClick(e, element.id)}
                  />
                );
              }

              if (element.shape === "rectangle") {
                return (
                  <rect
                    key={element.id}
                    x={b.x}
                    y={b.y}
                    width={Math.max(1, b.width)}
                    height={Math.max(1, b.height)}
                    stroke={element.color}
                    fill="transparent"
                    strokeWidth={element.lineWidth}
                    onClick={(e) => handleElementClick(e, element.id)}
                  />
                );
              }

              return (
                <ellipse
                  key={element.id}
                  cx={b.x + b.width / 2}
                  cy={b.y + b.height / 2}
                  rx={Math.max(1, b.width / 2)}
                  ry={Math.max(1, b.height / 2)}
                  stroke={element.color}
                  fill="transparent"
                  strokeWidth={element.lineWidth}
                  onClick={(e) => handleElementClick(e, element.id)}
                />
              );
            }

            if (element.type === "text") {
              return (
                <g key={element.id} onClick={(e) => handleElementClick(e, element.id)}>
                  <text
                    x={element.at.x}
                    y={element.at.y}
                    fill={element.color}
                    fontSize={element.fontSize}
                    fontWeight={600}
                  >
                    {element.text}
                  </text>
                  <rect
                    x={element.at.x - 2}
                    y={element.at.y - element.fontSize - 4}
                    width={Math.max(120, element.text.length * (element.fontSize * 0.56)) + 4}
                    height={element.fontSize + 10}
                    fill="transparent"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      beginInlineEdit(element);
                    }}
                  />
                  {isElementLocked(element) && (
                    <text x={element.at.x} y={element.at.y - element.fontSize - 8} fill="#fbbf24" fontSize={12} fontWeight={700}>
                      Locked
                    </text>
                  )}
                </g>
              );
            }

            if (element.type === "todo") {
              const boxSize = Math.max(14, Math.round(element.fontSize * 0.72));
              const y = element.at.y - boxSize + 2;
              const cardWidth = Math.max(220, getElementBounds(element).width);
              const cardHeight = Math.max(44, getElementBounds(element).height);
              return (
                <g
                  key={element.id}
                  onClick={(e) => handleElementClick(e, element.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    beginInlineEdit(element);
                  }}
                >
                  <rect
                    x={element.at.x}
                    y={y}
                    width={boxSize}
                    height={boxSize}
                    rx={3}
                    fill={element.checked ? "#22c55e" : "transparent"}
                    stroke={element.color}
                    strokeWidth={2}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canEditElement(element)) return;
                      const updated = { ...element, checked: !element.checked, updatedAt: Date.now() };
                      onUpdateElement(updated);
                      pushHistory({ kind: "update", before: element, after: updated });
                    }}
                  />
                  {element.checked && (
                    <path
                      d={`M ${element.at.x + 3} ${y + boxSize * 0.55} L ${element.at.x + boxSize * 0.42} ${y + boxSize - 3} L ${element.at.x + boxSize - 3} ${y + 3}`}
                      fill="none"
                      stroke="#052e16"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <foreignObject
                    x={element.at.x + boxSize + 8}
                    y={element.at.y - element.fontSize}
                    width={cardWidth - boxSize - 8}
                    height={cardHeight + 6}
                  >
                    <div className="text-xs text-zinc-100" onMouseDown={(event) => event.stopPropagation()}>
                      <div
                        className={`font-semibold ${element.checked ? "line-through opacity-70" : ""}`}
                        style={{ fontSize: `${element.fontSize}px`, lineHeight: 1.1 }}
                      >
                        {element.text || "Task"}
                      </div>
                      {(element.subtasks ?? []).length > 0 && (
                        <ul className="mt-1 space-y-1 text-[11px]">
                          {(element.subtasks ?? []).map((subtask) => (
                            <li
                              key={subtask.id}
                              className="flex items-center gap-1 rounded px-1 hover:bg-zinc-700/50"
                              draggable
                              onDragStart={() => setDragTodoSubtask({ todoId: element.id, subtaskId: subtask.id })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (!dragTodoSubtask || dragTodoSubtask.todoId !== element.id) return;
                                reorderTodoSubtask(element, dragTodoSubtask.subtaskId, subtask.id);
                                setDragTodoSubtask(null);
                              }}
                              onDragEnd={() => setDragTodoSubtask(null)}
                            >
                              <button
                                type="button"
                                className={`h-3 w-3 rounded-sm border ${subtask.checked ? "border-emerald-400 bg-emerald-500" : "border-zinc-400"}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleTodoSubtaskChecked(element, subtask.id);
                                }}
                                aria-label="Toggle subtask"
                              />
                              <span
                                className={`flex-1 truncate ${subtask.checked ? "line-through opacity-70" : ""}`}
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                  setInlineEditor({
                                    elementId: element.id,
                                    field: "subtask",
                                    subtaskId: subtask.id,
                                    value: subtask.text,
                                  });
                                  setSingleSelection(element.id);
                                }}
                              >
                                {subtask.text || "Subtask"}
                              </span>
                              <button
                                type="button"
                                className="text-zinc-400 hover:text-rose-300"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeTodoSubtask(element, subtask.id);
                                }}
                                aria-label="Delete subtask"
                              >
                                x
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            if (element.type === "frame") {
              return (
                <g
                  key={element.id}
                  onClick={(e) => handleElementClick(e, element.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    beginInlineEdit(element);
                  }}
                >
                  <rect
                    x={element.at.x}
                    y={element.at.y}
                    width={element.width}
                    height={element.height}
                    rx={14}
                    fill="transparent"
                    stroke={isSelected ? "#22d3ee" : element.color}
                    strokeDasharray="8 5"
                    strokeWidth={2}
                  />
                  <rect
                    x={element.at.x}
                    y={element.at.y - 30}
                    width={Math.min(260, Math.max(120, element.title.length * 9 + 24))}
                    height={24}
                    rx={8}
                    fill="#18181b"
                    stroke={isSelected ? "#22d3ee" : "#3f3f46"}
                    strokeWidth={1}
                  />
                  <text x={element.at.x + 12} y={element.at.y - 13} fill="#e4e4e7" fontSize={13} fontWeight={700}>
                    {element.title}
                  </text>
                  {isElementLocked(element) && (
                    <text x={element.at.x + 12} y={element.at.y + 18} fill="#fbbf24" fontSize={12} fontWeight={700}>
                      Locked
                    </text>
                  )}
                </g>
              );
            }

            if (element.type === "connector") {
              const geometry = connectorGeometryMap.get(element.id);
              if (!geometry) return null;
              return (
                <g key={element.id}>
                  <path
                    d={geometry.path}
                    stroke={element.color}
                    strokeWidth={element.lineWidth}
                    strokeDasharray="7 6"
                    markerEnd="url(#arrow-head)"
                    fill="none"
                    onClick={(e) => handleElementClick(e, element.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!canEditElement(element)) return;
                      const boardPoint = getBoardPointFromClient(e.clientX, e.clientY);
                      if (!boardPoint) return;
                      const current = connectorGeometryMap.get(element.id);
                      if (!current || current.points.length < 2) return;
                      const idx = nearestSegmentIndex(current.points, boardPoint);
                      const currentWaypoints = element.waypoints?.slice() ?? current.points.slice(1, -1);
                      const insertAt = Math.max(0, Math.min(currentWaypoints.length, idx));
                      currentWaypoints.splice(insertAt, 0, { x: boardPoint.x, y: boardPoint.y });
                      onUpdateElement({ ...element, waypoints: currentWaypoints, updatedAt: Date.now() });
                      setSingleSelection(element.id);
                    }}
                  />
                  {isSelected && geometry.points.slice(1, -1).map((p, i) => (
                    <circle
                      key={`${element.id}-wp-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={5}
                      fill="#22d3ee"
                      stroke="#0f172a"
                      strokeWidth={1.5}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!canEditElement(element)) return;
                        const current = element.waypoints?.slice() ?? geometry.points.slice(1, -1);
                        if (i < 0 || i >= current.length) return;
                        current.splice(i, 1);
                        onUpdateElement({ ...element, waypoints: current, updatedAt: Date.now() });
                      }}
                    />
                  ))}
                </g>
              );
            }

            if (element.type === "comment") {
              return (
                <g
                  key={element.id}
                  onClick={(e) => handleElementClick(e, element.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    beginInlineEdit(element);
                  }}
                >
                  <circle cx={element.at.x} cy={element.at.y} r={9} fill={element.resolved ? "#10b981" : "#f59e0b"} stroke="#0f172a" strokeWidth={2} />
                  <circle cx={element.at.x + 9} cy={element.at.y - 9} r={8} fill="#0f172a" stroke="#f8fafc" strokeWidth={1} />
                  <text x={element.at.x + 6} y={element.at.y - 5} fill="#f8fafc" fontSize={9} fontWeight={700}>
                    {element.replies.length + 1}
                  </text>
                  <text x={element.at.x + 14} y={element.at.y + 4} fill="#e2e8f0" fontSize={12} fontWeight={700}>
                    {element.text.slice(0, 42)}
                  </text>
                  {isElementLocked(element) && (
                    <text x={element.at.x + 14} y={element.at.y + 18} fill="#fbbf24" fontSize={11} fontWeight={700}>
                      Locked
                    </text>
                  )}
                </g>
              );
            }

            if (element.type !== "sticky") {
              return null;
            }

            return (
              <g
                key={element.id}
                onClick={(e) => handleElementClick(e, element.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  beginInlineEdit(element);
                }}
              >
                <rect
                  x={element.at.x}
                  y={element.at.y}
                  width={element.width}
                  height={element.height}
                  rx={12}
                  fill={element.fillColor}
                  stroke={isSelected ? "#22d3ee" : "#475569"}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <foreignObject
                  x={element.at.x + 10}
                  y={element.at.y + 10}
                  width={element.width - 20}
                  height={element.height - 20}
                >
                  <div className="text-xs font-medium text-slate-800 whitespace-pre-wrap break-words">
                    {element.text}
                  </div>
                </foreignObject>
                {isElementLocked(element) && (
                  <text x={element.at.x + 12} y={element.at.y + 22} fill="#92400e" fontSize={12} fontWeight={700}>
                    Locked
                  </text>
                )}
              </g>
            );
          })}

          {cursors
            .filter((cursor) => cursor.socketId !== selfSocketId)
            .map((cursor) => (
              <g key={`cursor-${cursor.socketId}`}>
                {(() => {
                  const trail = cursorTrails[cursor.socketId] ?? [];
                  if (trail.length < 2) return null;
                  const points = trail.map((p) => `${p.x},${p.y}`).join(" ");
                  return <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth={2} opacity={0.35} />;
                })()}
                {(() => {
                  const idleMs = Math.max(0, nowTick - cursor.updatedAt);
                  const opacity = Math.max(0.15, 1 - idleMs / 5000);
                  return (
                    <>
                      <circle cx={cursor.x} cy={cursor.y} r={5} fill="#22d3ee" opacity={opacity} />
                      <rect x={cursor.x + 8} y={cursor.y - 20} rx={6} ry={6} width={Math.max(80, cursor.participantName.length * 7 + 12)} height={20} fill="#0f172a" stroke="#22d3ee" strokeWidth={1} opacity={opacity} />
                    </>
                  );
                })()}
                <text x={cursor.x + 14} y={cursor.y - 6} fontSize={11} fill="#e2e8f0" fontWeight={600}>
                  {cursor.participantName}
                </text>
              </g>
            ))}

          {selectionBounds && (() => {
            const b = selectionBounds;
            const handles = getResizeHandles(b);
            const canResize =
              selectedElements.length > 0 &&
              selectedElements.every((item) => canEditElement(item)) &&
              selectedElements.every((item) => item.type === "shape" || item.type === "sticky" || item.type === "frame");
            return (
              <g pointerEvents="none">
                <rect
                  x={b.x - 6}
                  y={b.y - 6}
                  width={Math.max(12, b.width + 12)}
                  height={Math.max(12, b.height + 12)}
                  stroke={selectedElements.some((item) => isElementLocked(item)) ? "#fbbf24" : "#22d3ee"}
                  strokeDasharray="6 6"
                  fill="transparent"
                />
                {canResize && (
                  <>
                    <circle cx={handles.nw.x} cy={handles.nw.y} r={5} fill="#22d3ee" />
                    <circle cx={handles.ne.x} cy={handles.ne.y} r={5} fill="#22d3ee" />
                    <circle cx={handles.sw.x} cy={handles.sw.y} r={5} fill="#22d3ee" />
                    <circle cx={handles.se.x} cy={handles.se.y} r={5} fill="#22d3ee" />
                  </>
                )}
              </g>
            );
          })()}

          {marqueeBounds && (
            <rect
              x={marqueeBounds.x}
              y={marqueeBounds.y}
              width={Math.max(1, marqueeBounds.width)}
              height={Math.max(1, marqueeBounds.height)}
              fill="#22d3ee22"
              stroke="#22d3ee"
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {selectedElement?.type === "comment" && (
          <div className="absolute left-4 top-4 w-80 rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 text-xs shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold text-zinc-100">Comment Thread</p>
              <span className={`rounded px-2 py-0.5 text-[10px] ${selectedElement.resolved ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                {selectedElement.resolved ? "Resolved" : "Open"}
              </span>
            </div>
            <div className="space-y-2">
              <div className="rounded border border-zinc-700 bg-zinc-800 p-2">
                <p className="text-zinc-100">{selectedElement.text}</p>
                <p className="mt-1 text-[10px] text-zinc-400">{selectedElement.participantName}</p>
              </div>
              {selectedElement.replies.length === 0 ? (
                <p className="text-zinc-400">No replies yet.</p>
              ) : (
                selectedElement.replies.slice(-5).map((reply) => (
                  <div key={reply.id} className="rounded border border-zinc-700 bg-zinc-800 p-2">
                    <p className="text-zinc-100">{reply.text}</p>
                    <p className="mt-1 text-[10px] text-zinc-400">{reply.author}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="absolute bottom-4 right-4 rounded-md border border-zinc-700 bg-zinc-900/90 p-2">
          <svg
            width={220}
            height={140}
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            className="cursor-pointer"
            onClick={(event) => {
              const target = event.currentTarget;
              const rect = target.getBoundingClientRect();
              const x = ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH;
              const y = ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT;
              setViewOrigin(
                clampOrigin({
                  x: x - viewportWidth / 2,
                  y: y - viewportHeight / 2,
                }),
              );
            }}
          >
            <rect x={0} y={0} width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#18181b" stroke="#3f3f46" strokeWidth={12} />
            {sortedElements.map((element) => {
              if (element.type === "connector") {
                const geometry = connectorGeometryMap.get(element.id);
                if (!geometry) return null;
                return (
                  <path
                    key={`mini-${element.id}`}
                    d={geometry.path}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={6}
                  />
                );
              }
              const b = getElementBounds(element);
              return <rect key={`mini-${element.id}`} x={b.x} y={b.y} width={Math.max(8, b.width)} height={Math.max(8, b.height)} fill="#64748b" opacity={0.7} />;
            })}
            <rect x={viewOrigin.x} y={viewOrigin.y} width={viewportWidth} height={viewportHeight} fill="transparent" stroke="#22d3ee" strokeWidth={10} />
          </svg>
        </div>

        {elements.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-zinc-500">
              Pen, shapes, text, sticky notes, select/edit, erase, undo/redo
            </p>
          </div>
        )}

        {(() => {
          if (!inlineEditor) return null;
          const editingElement = elements.find((item) => item.id === inlineEditor.elementId);
          if (!editingElement) return null;

          let box: { x: number; y: number; width: number; height: number; fontSize: number } | null = null;

          if (editingElement.type === "text") {
            box = {
              x: editingElement.at.x,
              y: editingElement.at.y - editingElement.fontSize,
              width: Math.max(180, editingElement.text.length * (editingElement.fontSize * 0.56) + 40),
              height: Math.max(36, editingElement.fontSize + 12),
              fontSize: editingElement.fontSize,
            };
          } else if (editingElement.type === "todo") {
            if (inlineEditor.field === "subtask" && inlineEditor.subtaskId) {
              const idx = (editingElement.subtasks ?? []).findIndex((subtask) => subtask.id === inlineEditor.subtaskId);
              const safeIdx = idx < 0 ? 0 : idx;
              box = {
                x: editingElement.at.x + 42,
                y: editingElement.at.y - editingElement.fontSize + 22 + safeIdx * (editingElement.fontSize * 1.2),
                width: Math.max(180, getElementBounds(editingElement).width - 60),
                height: Math.max(24, editingElement.fontSize + 4),
                fontSize: Math.max(11, editingElement.fontSize - 2),
              };
            } else {
              box = {
                x: editingElement.at.x + 26,
                y: editingElement.at.y - editingElement.fontSize,
                width: Math.max(180, editingElement.text.length * (editingElement.fontSize * 0.56) + 56),
                height: Math.max(36, editingElement.fontSize + 12),
                fontSize: editingElement.fontSize,
              };
            }
          } else if (editingElement.type === "frame") {
            box = {
              x: editingElement.at.x + 6,
              y: editingElement.at.y - 28,
              width: Math.min(280, Math.max(160, editingElement.width - 12)),
              height: 24,
              fontSize: 13,
            };
          } else if (editingElement.type === "sticky") {
            box = {
              x: editingElement.at.x + 10,
              y: editingElement.at.y + 10,
              width: Math.max(90, editingElement.width - 20),
              height: Math.max(40, editingElement.height - 20),
              fontSize: 13,
            };
          } else if (editingElement.type === "comment") {
            box = {
              x: editingElement.at.x + 14,
              y: editingElement.at.y - 10,
              width: 260,
              height: 60,
              fontSize: 12,
            };
          }

          if (!box) return null;

          const left = ((box.x - viewOrigin.x) / viewportWidth) * 100;
          const top = ((box.y - viewOrigin.y) / viewportHeight) * 100;
          const width = (box.width / viewportWidth) * 100;
          const height = (box.height / viewportHeight) * 100;

          return (
            <textarea
              ref={inlineEditorRef}
              value={inlineEditor.value}
              onChange={(event) =>
                setInlineEditor((prev) => (prev ? { ...prev, value: event.target.value } : prev))
              }
              onBlur={commitInlineEdit}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelInlineEdit();
                  return;
                }

                if (editingElement.type === "todo" && inlineEditor.field === "subtask" && inlineEditor.subtaskId) {
                  const existingSubtasks = editingElement.subtasks ?? [];
                  const currentIndex = existingSubtasks.findIndex(
                    (subtask) => subtask.id === inlineEditor.subtaskId,
                  );

                  if (currentIndex >= 0) {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!canEditElement(editingElement)) return;

                      const newSubtask = {
                        id: `${editingElement.id}-sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        text: "",
                        checked: false,
                      };

                      const updatedSubtasks = existingSubtasks.map((subtask) =>
                        subtask.id === inlineEditor.subtaskId
                          ? { ...subtask, text: inlineEditor.value }
                          : subtask,
                      );
                      updatedSubtasks.splice(currentIndex + 1, 0, newSubtask);

                      const updated = {
                        ...editingElement,
                        subtasks: updatedSubtasks,
                        updatedAt: Date.now(),
                      };
                      onUpdateElement(updated);
                      pushHistory({ kind: "update", before: editingElement, after: updated });
                      setInlineEditor({
                        elementId: editingElement.id,
                        field: "subtask",
                        subtaskId: newSubtask.id,
                        value: "",
                      });
                      return;
                    }

                    if (event.key === "Tab") {
                      event.preventDefault();
                      if (!canEditElement(editingElement)) return;

                      const targetIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
                      if (targetIndex < 0 || targetIndex >= existingSubtasks.length) {
                        return;
                      }

                      const reordered = existingSubtasks.map((subtask) =>
                        subtask.id === inlineEditor.subtaskId
                          ? { ...subtask, text: inlineEditor.value }
                          : subtask,
                      );
                      const [moved] = reordered.splice(currentIndex, 1);
                      reordered.splice(targetIndex, 0, moved);

                      const updated = {
                        ...editingElement,
                        subtasks: reordered,
                        updatedAt: Date.now(),
                      };
                      onUpdateElement(updated);
                      pushHistory({ kind: "update", before: editingElement, after: updated });
                      return;
                    }
                  }
                }

                if (event.key === "Enter" && !event.shiftKey && editingElement.type !== "sticky" && editingElement.type !== "comment") {
                  event.preventDefault();
                  commitInlineEdit();
                }
              }}
              className="absolute z-20 resize-none rounded border border-cyan-400 bg-zinc-950/95 px-2 py-1 text-zinc-100 outline-none"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${Math.max(8, width)}%`,
                height: `${Math.max(4, height)}%`,
                fontSize: `${box.fontSize}px`,
                lineHeight: 1.3,
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}
