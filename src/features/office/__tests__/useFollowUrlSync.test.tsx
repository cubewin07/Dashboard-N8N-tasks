import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import { makeConfig, makeState } from '@/domain/__fixtures__/builders'
import type { EmployeeId } from '@/domain/primitives'
import { useConfigStore } from '@/office/configStore'
import { useOffice } from '@/office/store'
import { usePeopleUi } from '@/office/uiStore'
import { useFollowUrlSync } from '../useFollowUrlSync'

let currentUrl = ''
let navigate: NavigateFunction

function Probe() {
  useFollowUrlSync()
  const location = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    navigate = nav
    currentUrl = `${location.pathname}${location.search}`
  })
  return null
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>,
  )
}

function loadState() {
  const state = makeState(makeConfig())
  useConfigStore.setState({ config: state.config, status: 'ready', error: null })
  useOffice.setState({ state })
}

describe('useFollowUrlSync (P04-T12)', () => {
  beforeEach(() => {
    currentUrl = ''
    useConfigStore.setState({ config: null })
    useOffice.setState({ state: null })
    usePeopleUi.setState({ selectedId: null, followedId: null, hoveredId: null })
  })

  afterEach(() => {
    cleanup()
    useOffice.setState({ state: null })
  })

  it('URL → store on load, keeping the URL untouched', async () => {
    loadState()
    renderAt('/office?cam=floor&floor=cs&follow=emp_mai')
    await waitFor(() => expect(usePeopleUi.getState().followedId).toBe('emp_mai'))
    expect(currentUrl).toBe('/office?cam=floor&floor=cs&follow=emp_mai')
  })

  it('waits for the config before judging a URL id', async () => {
    renderAt('/office?follow=emp_mai')
    expect(usePeopleUi.getState().followedId).toBeNull()
    act(() => loadState())
    await waitFor(() => expect(usePeopleUi.getState().followedId).toBe('emp_mai'))
    expect(currentUrl).toBe('/office?follow=emp_mai')
  })

  it('store → URL with the other params preserved, and back again', async () => {
    loadState()
    renderAt('/office?cam=free&seed=7')

    act(() => usePeopleUi.getState().follow('emp_mai' as EmployeeId))
    await waitFor(() => expect(currentUrl).toBe('/office?cam=free&seed=7&follow=emp_mai'))

    act(() => usePeopleUi.getState().follow('emp_ngoc' as EmployeeId))
    await waitFor(() => expect(currentUrl).toBe('/office?cam=free&seed=7&follow=emp_ngoc'))

    act(() => usePeopleUi.getState().follow(null))
    await waitFor(() => expect(currentUrl).toBe('/office?cam=free&seed=7'))
  })

  it('follows URL changes made by navigation (back/forward)', async () => {
    loadState()
    renderAt('/office?follow=emp_mai')
    await waitFor(() => expect(usePeopleUi.getState().followedId).toBe('emp_mai'))

    act(() => navigate('/office?follow=emp_ngoc'))
    await waitFor(() => expect(usePeopleUi.getState().followedId).toBe('emp_ngoc'))

    act(() => navigate('/office?cam=free'))
    await waitFor(() => expect(usePeopleUi.getState().followedId).toBeNull())
    expect(currentUrl).toBe('/office?cam=free')
  })

  it('drops ids that are not active employees from the URL', async () => {
    loadState()
    renderAt('/office?floor=cs&follow=emp_nobody')
    await waitFor(() => expect(currentUrl).toBe('/office?floor=cs'))
    expect(usePeopleUi.getState().followedId).toBeNull()
  })

  it('a follow started before the page mounted is written to the URL', async () => {
    loadState()
    usePeopleUi.setState({ followedId: 'emp_thu' as EmployeeId })
    renderAt('/office')
    await waitFor(() => expect(currentUrl).toBe('/office?follow=emp_thu'))
    expect(usePeopleUi.getState().followedId).toBe('emp_thu')
  })

  it('stops following a person who gets archived', async () => {
    loadState()
    renderAt('/office?follow=emp_mai')
    await waitFor(() => expect(usePeopleUi.getState().followedId).toBe('emp_mai'))

    const state = useOffice.getState().state!
    act(() => {
      useOffice.setState({
        state: {
          ...state,
          config: {
            ...state.config,
            employees: state.config.employees.map((e) =>
              e.id === 'emp_mai' ? { ...e, state: 'archived' as const } : e,
            ),
          },
        },
      })
    })
    await waitFor(() => expect(currentUrl).toBe('/office'))
    expect(usePeopleUi.getState().followedId).toBeNull()
  })
})
