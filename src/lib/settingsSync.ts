// Keeps budgets, the savings goal and the billing day in sync with the
// user_settings table, so they follow the user across devices. The store keeps
// a localStorage copy too, so they still show instantly and offline.
import { useUserStore, type SyncedSettings } from '../stores/userStore'
import { useToastStore } from '../stores/toastStore'
import { fetchUserSettings, saveUserSettings } from './api'

// Where the billing day lived before it moved into the store
const LEGACY_BILLING_DAY_KEY = 'defaultBillingDay'

// Bumped on every start/stop, so work from an older session (e.g. a fetch that
// returns after logout) can tell it's stale and bail out
let generation = 0
let stopCurrent: (() => void) | null = null

function pickSynced(): SyncedSettings {
  const { budgets, monthlySavingsGoalUSD, billingDay } = useUserStore.getState()
  return { budgets, monthlySavingsGoalUSD, billingDay }
}

function migrateLegacyBillingDay() {
  try {
    const legacy = localStorage.getItem(LEGACY_BILLING_DAY_KEY)
    if (legacy === null) return
    const day = parseInt(legacy)
    if (day >= 1 && day <= 28) useUserStore.getState().setBillingDay(day)
    localStorage.removeItem(LEGACY_BILLING_DAY_KEY)
  } catch {
    // localStorage unavailable (private mode): nothing to migrate
  }
}

/**
 * Pulls the user's saved settings (or, on their first sync, uploads this
 * device's current ones so nothing is lost), then saves every change.
 * If the table is unreachable, settings just stay device-only.
 */
export async function startSettingsSync(userId: string): Promise<void> {
  stopSettingsSync()
  const myGeneration = generation
  const isStale = () => myGeneration !== generation

  migrateLegacyBillingDay()

  // Applying settings pulled from the server must not echo them straight back
  let applyingRemote = false
  const pull = async () => {
    const remote = await fetchUserSettings(userId)
    if (isStale()) return
    if (remote) {
      applyingRemote = true
      useUserStore.getState().applySyncedSettings(remote)
      applyingRemote = false
    } else {
      await saveUserSettings(userId, pickSynced())
    }
  }

  try {
    await pull()
  } catch (error) {
    console.error('Settings sync unavailable, keeping them on this device:', error)
    return
  }
  if (isStale()) return

  // Saves run one at a time and always send the latest values, so a slow
  // request can never land after a newer one and overwrite it
  let queue = Promise.resolve()
  const save = () => {
    queue = queue.then(async () => {
      try {
        await saveUserSettings(userId, pickSynced())
      } catch (error) {
        console.error('Error saving settings:', error)
        useToastStore.getState().addToast('No se pudo sincronizar la configuración. Quedó guardada en este dispositivo.')
      }
    })
  }

  const unsubscribe = useUserStore.subscribe((state, prev) => {
    if (applyingRemote) return
    if (
      state.budgets !== prev.budgets ||
      state.monthlySavingsGoalUSD !== prev.monthlySavingsGoalUSD ||
      state.billingDay !== prev.billingDay
    ) {
      save()
    }
  })

  // An installed app can sit in the background for days; re-pull when it comes
  // back so an edit here doesn't overwrite newer changes made on another device
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    // Queued behind pending saves, so it can't pull values older than an edit in flight
    queue = queue.then(pull).catch((error) => console.error('Error refreshing settings:', error))
  }
  document.addEventListener('visibilitychange', onVisible)

  stopCurrent = () => {
    unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** Stops syncing (on logout). Saves already sent still complete. */
export function stopSettingsSync(): void {
  generation++
  stopCurrent?.()
  stopCurrent = null
}
