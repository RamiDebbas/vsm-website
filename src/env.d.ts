/// <reference types="vite/client" />

/** Absolute site origin injected at build time from the SITE_URL env var ('' when unknown). */
declare const __SITE_URL__: string;
declare const __COMPANY__: string;

declare module 'virtual:divisions.css';

declare module '*.svg?raw' {
  const content: string;
  export default content;
}
