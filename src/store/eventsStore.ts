import { create } from 'zustand'
import { fetchEvents, fetchMySubscriptions, type AppEvent, type EventSubscription } from '@/lib/eventsApi'

// Events + the signed-in user's subscriptions, shared by the Home banner, the
// Assets "Events" entry and the event pages so they always agree (e.g. the
// banner flips to "Subscribed" the moment the limit is reached).

interface EventsState {
  events: AppEvent[]
  subs: EventSubscription[]
  loaded: boolean
  loading: boolean
  load: () => Promise<void>
  reset: () => void
}

let inFlight: Promise<void> | null = null

export const useEventsStore = create<EventsState>((set) => ({
  events: [],
  subs: [],
  loaded: false,
  loading: false,
  load: () => {
    if (inFlight) return inFlight
    set({ loading: true })
    inFlight = (async () => {
      try {
        const [events, subs] = await Promise.all([fetchEvents(), fetchMySubscriptions()])
        set({ events, subs, loaded: true })
      } catch (e) {
        // Keep what we had; the screens show their own empty/error states.
        console.warn('[events] load failed:', (e as Error).message)
        set({ loaded: true })
      } finally {
        set({ loading: false })
        inFlight = null
      }
    })()
    return inFlight
  },
  reset: () => set({ events: [], subs: [], loaded: false, loading: false }),
}))
