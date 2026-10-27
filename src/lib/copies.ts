import type { Copy } from "../types";

export function makeEmptyCopy(label: string, orderKey: number): Copy {
  return {
    id: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    orderKey,
    fileName: null,
    imageUrl: null,
    busy: false,
    error: null,
    transcript: "",
    approved: false,
    notes: [],
    splitMode: false,
    splitX: 50,
    crops: null,
  };
}
