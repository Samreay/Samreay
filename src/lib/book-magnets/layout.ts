export interface Book {
  id: string;
  title: string;
  series?: { name: string; volume: number; edition?: string; part?: number };
  author: string;
  src: string;
  thumb: string;
  original?: Blob;
  width: number;
  height: number;
}
export const fillets = {
  fillet: 'Single blind rule', double: 'Double hairline', weighted: 'Thick and thin',
  tapered: 'Tapered rule', diamond: 'Diamond break',
} as const;
export type Binding = keyof typeof fillets | 'none';
export type InkEffect = 'flat' | 'gradient' | 'metallic';
export const backgroundDefaults = { saturation: 100, darkness: 65 };
export const backgroundControls = [
  { key: 'saturation', label: 'Background saturation', max: 200 },
  { key: 'darkness', label: 'Background darkness', max: 100 },
] as const;
export type Finish = {
  binding: Binding;
  texture: 'leather' | 'gradient' | 'none';
  transform: 'title' | 'uppercase' | 'small-caps';
  lettering: InkEffect | 'dynamic';
} & typeof backgroundDefaults;
export const papers = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210],
  'US Letter': [215.9, 279.4], 'US Legal': [215.9, 355.6],
  '8 × 12 in': [203.2, 304.8], '8 × 8 in': [203.2, 203.2],
} as const;
export const margin = 8;
const wrapGap = 0.3; // mm between finished wraps

export function layout(paperW: number, paperH: number, height: number, ratio: number, spine: number, dpi: number) {
  const face = height / ratio;
  const wrap = 2 * face + spine;
  const columnPitch = wrap + wrapGap, rowPitch = height + wrapGap;
  const columns = Math.floor((paperW - 2 * margin + wrapGap) / columnPitch);
  const rows = Math.floor((paperH - 2 * margin + wrapGap) / rowPitch);
  const widthPx = Math.round(paperW * dpi / 25.4);
  const heightPx = Math.round(paperH * dpi / 25.4);
  let error = '';
  if (![paperW, paperH, height, ratio, spine, dpi].every(n => Number.isFinite(n) && n > 0))
    error = 'Enter a positive number for each dimension and the DPI.';
  else if (height < 5 || face < 2 || spine < 1 || dpi < 72)
    error = 'Use at least 5 mm height, 2 mm face width, 1 mm spine and 72 DPI.';
  else if (columns < 1 || rows < 1) error = 'This wrap is too large for the paper and its 8 mm margins.';
  else if (widthPx * heightPx > 72_000_000 || Math.max(widthPx, heightPx) > 10000)
    error = 'Choose a smaller sheet or lower DPI to fit the 72 megapixel and 10000 px export limits.';
  return { face, wrap, spine, height, paperW, paperH, dpi, widthPx, heightPx, columnPitch, rowPitch, columns, capacity: columns * rows, error };
}
export type Layout = ReturnType<typeof layout>;

// The limiting axis sets the enlargement required to cover the whole face.
export function coverPixelsPerMm(image: { width: number; height: number }, sheet: Layout) {
  return Math.min(image.width / sheet.face, image.height / sheet.height);
}

export function availableDpi(book: Book, sheet: Layout) {
  return 25.4 * coverPixelsPerMm(book, sheet);
}
