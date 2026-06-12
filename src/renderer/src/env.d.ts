/// <reference types="vite/client" />
import type { GenNalApi } from '../../preload'

declare global {
  interface Window {
    api: GenNalApi
  }
}

export {}
