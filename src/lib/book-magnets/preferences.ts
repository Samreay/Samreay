import { backgroundControls, backgroundDefaults, fillets, papers, type Book, type Finish } from './layout';

export const settingsKey = 'book-magnets.settings.v1';
export const librarySorts = {
  ranking: "Sam's Ranking", series: 'Alphabetical by series', author: 'Alphabetical by author',
} as const;
type Settings = Finish & {
  paper: keyof typeof papers | 'Custom'; paperW: number; paperH: number;
  height: number; ratio: number; spine: number; dpi: number;
  ids: string[]; titles: Record<string, string>; settingsCollapsed: boolean; librarySort: keyof typeof librarySorts;
};

export function defaultSettings(rankedIds: string[]): Settings {
  return {
    paper: 'A4', paperW: 210, paperH: 297, height: 40, ratio: 1.6, spine: 7, dpi: 600,
    binding: 'fillet', texture: 'leather', transform: 'uppercase', lettering: 'dynamic',
    ...backgroundDefaults,
    ids: rankedIds.slice(0, 12), titles: {}, settingsCollapsed: false, librarySort: 'ranking',
  };
}

function choice<T extends string>(value: unknown, options: readonly string[], fallback: T): T {
  return typeof value === 'string' && options.includes(value) ? value as T : fallback;
}

function overrides(value: Record<string, unknown>, defaults: Settings, books: Book[]) {
  const result: Partial<Settings> = {};
  for (const { key, max } of backgroundControls) {
    const n = value[key];
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max && n !== defaults[key]) result[key] = n;
  }
  for (const key of ['paperW', 'paperH', 'height', 'ratio', 'spine', 'dpi'] as const) {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0 && n !== defaults[key]) result[key] = n;
  }
  const options = {
    librarySort: choice(value.librarySort, Object.keys(librarySorts), defaults.librarySort),
    paper: choice(value.paper, [...Object.keys(papers), 'Custom'], defaults.paper),
    binding: choice(value.binding, [...Object.keys(fillets), 'none'], defaults.binding),
    texture: choice(value.texture, ['leather', 'gradient', 'none'], defaults.texture),
    transform: choice(value.transform, ['title', 'uppercase', 'small-caps'], defaults.transform),
    lettering: choice(value.lettering, ['flat', 'gradient', 'metallic', 'dynamic'], defaults.lettering),
  };
  Object.assign(result, Object.fromEntries(Object.entries(options).filter(([key, v]) => v !== defaults[key as keyof typeof options])));
  if (value.settingsCollapsed === true) result.settingsCollapsed = true;

  const byId = new Map(books.map(book => [book.id, book]));
  // Another tab may have saved its selection before we received its library update.
  const savedBook = (id: string) => !id.startsWith('visit:') && (byId.has(id) || /^custom:[a-f0-9]{32}$/.test(id));
  if (Array.isArray(value.ids)) {
    const ids = [...new Set(value.ids.filter((id): id is string => typeof id === 'string' && savedBook(id)))];
    if (ids.length !== defaults.ids.length || ids.some((id, i) => id !== defaults.ids[i])) result.ids = ids;
  }
  if (value.titles && typeof value.titles === 'object') {
    const titles = Object.entries(value.titles).filter(([id, title]) =>
      savedBook(id) && typeof title === 'string' && title.trim() && (byId.get(id)?.series || title.trim() !== byId.get(id)?.title));
    if (titles.length) result.titles = Object.fromEntries(titles);
  }
  return result;
}

export function restoreSettings(defaults: Settings, books: Book[]) {
  try {
    const raw = JSON.parse(localStorage.getItem(settingsKey) ?? '{}');
    return { ...defaults, ...overrides(raw, defaults, books) };
  } catch { return defaults; }
}

export function saveSettings(settings: Settings, defaults: Settings, books: Book[]) {
  const changes = overrides(settings, defaults, books);
  if (Object.keys(changes).length) localStorage.setItem(settingsKey, JSON.stringify(changes));
  else localStorage.removeItem(settingsKey);
}
