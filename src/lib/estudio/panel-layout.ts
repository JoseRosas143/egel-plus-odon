export const defaultPanelSizes = [30, 42, 28];
const minimumPixels = [240, 280, 240];

export function focusedTutorSize(sizes: number[]) { return sizes[0] + sizes[1]; }

/** A focused resize preserves the question/tutor ratio for the return to three panels. */
export function resizePanelSizes(original: number[], index: number, desired: number, width: number, focused = false) {
  const next = [...original];
  if (focused) {
    const combined = focusedTutorSize(original);
    const total = combined + original[2];
    const min = Math.max(18, minimumPixels[1] / width * 100);
    const max = Math.max(min, total - Math.max(18, minimumPixels[2] / width * 100));
    const left = Math.min(Math.max(desired, min), max);
    const questionRatio = combined > 0 ? original[0] / combined : defaultPanelSizes[0] / focusedTutorSize(defaultPanelSizes);
    return [left * questionRatio, left * (1 - questionRatio), total - left];
  }
  const total = original[index] + original[index + 1];
  const min = Math.max(18, minimumPixels[index] / width * 100);
  const max = Math.max(min, total - Math.max(18, minimumPixels[index + 1] / width * 100));
  next[index] = Math.min(Math.max(desired, min), max);
  next[index + 1] = total - next[index];
  return next;
}
