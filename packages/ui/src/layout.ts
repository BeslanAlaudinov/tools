/** Fits a frame of the given proportions into a box, leaving room for the corner chips and the dock. */
export function fitFrame(
  boxW: number,
  boxH: number,
  frameW: number,
  frameH: number,
  pad = { x: 48, top: 64, bottom: 96 },
) {
  const availW = Math.max(100, boxW - pad.x * 2);
  const availH = Math.max(100, boxH - pad.top - pad.bottom);
  const ratio = frameW / frameH;
  let w = availW;
  let h = w / ratio;
  if (h > availH) {
    h = availH;
    w = h * ratio;
  }
  return { w: Math.floor(w), h: Math.floor(h) };
}
