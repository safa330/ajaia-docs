/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Prebuilt browser bundle of mammoth (.docx -> HTML); it ships without type definitions.
declare module 'mammoth/mammoth.browser.js';
