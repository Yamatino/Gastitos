import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { promptInstall, useInstallState } from '../lib/installPrompt'

describe('installPrompt', () => {
  it('captures the browser prompt, opens it once, and reports the outcome', async () => {
    const { result } = renderHook(() => useInstallState())
    expect(result.current.canPrompt).toBe(false)

    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    act(() => {
      window.dispatchEvent(event)
    })

    // The browser's own mini-infobar is suppressed in favor of our button
    expect(event.defaultPrevented).toBe(true)
    expect(result.current.canPrompt).toBe(true)

    let accepted = false
    await act(async () => {
      accepted = await promptInstall()
    })
    expect(prompt).toHaveBeenCalledOnce()
    expect(accepted).toBe(true)
    // A prompt can only be used once
    expect(result.current.canPrompt).toBe(false)
    expect(await promptInstall()).toBe(false)
  })
})
