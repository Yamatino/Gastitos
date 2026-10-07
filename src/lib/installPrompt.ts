// Tracks whether the app can be installed ("Add to home screen") and exposes
// the browser's install prompt to the UI. Chrome/Edge fire `beforeinstallprompt`
// once, often before React has rendered, so this listens from module load
// (imported by main.tsx). Safari never fires it: iPhone users install from the
// Share menu, so the UI shows instructions instead.
import { useSyncExternalStore } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = {
  /** Running as the installed app (home screen icon) */
  installed: boolean
  /** The browser offered a prompt we can open with promptInstall() */
  canPrompt: boolean
  /** iPhone/iPad: install only via Share → Add to Home Screen */
  isIOS: boolean
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedNow = false
const listeners = new Set<() => void>()
const notify = () => {
  state = computeState()
  listeners.forEach((listener) => listener())
}

function computeState(): InstallState {
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      // iPadOS reports itself as a Mac with touch
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  return { installed: standalone || installedNow, canPrompt: deferredPrompt !== null, isIOS }
}

let state = computeState()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser from showing its own mini-infobar; we offer the button instead
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installedNow = true
    notify()
  })
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state
  )
}

/** Opens the browser's install prompt. Returns true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  // A prompt can only be used once
  deferredPrompt = null
  notify()
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  return outcome === 'accepted'
}
