import * as React from "react"

const mobileQuery = "(max-width: 767px)"

function subscribe(onChange: () => void) {
  const media = window.matchMedia(mobileQuery)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(mobileQuery).matches, () => false)
}
