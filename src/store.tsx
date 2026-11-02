import { createContext, useContext } from 'react';
import type { Picture, Settings } from './lib/types';

export type Route =
  | { name: 'home' }
  | { name: 'pick' }
  | { name: 'library' }
  | { name: 'record'; pictureId: string; fromDraft?: boolean }
  | { name: 'clip'; clipId: string }
  | { name: 'archive' }
  | { name: 'compose'; clipIds: string[] }
  | { name: 'settings' }
  | { name: 'motions' };

export interface AppCtx {
  pictures: Picture[];
  reloadPictures: () => Promise<void>;
  settings: Settings;
  setSettings: (s: Settings) => Promise<void>;
  go: (r: Route) => void;
  replace: (r: Route) => void;
  back: () => void;
  toast: (s: string) => void;
}

export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);
