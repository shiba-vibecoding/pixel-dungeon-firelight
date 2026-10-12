/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL of the co-op server, e.g. wss://pd-coop.example.workers.dev */
  readonly VITE_SERVER_URL?: string;
  /** The Mini App's t.me link, e.g. https://t.me/pixel_dungeon_gamebot/pixel_dungeon */
  readonly VITE_TG_APP_LINK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
