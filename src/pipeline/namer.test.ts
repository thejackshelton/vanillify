import { describe, it, expect } from 'vite-plus/test'
import { assignNames, selectorFor } from './namer'
import type { NodeEntry } from '../types'

describe('assignNames', () => {
  it('assigns node0, node1, node2 in order', () => {
    const entries: NodeEntry[] = [
      { nodeIndex: 0, classNames: ['flex'], span: { start: 0, end: 10 }, isDynamic: false },
      { nodeIndex: 1, classNames: ['text-sm'], span: { start: 20, end: 30 }, isDynamic: false },
      { nodeIndex: 2, classNames: ['p-4'], span: { start: 40, end: 50 }, isDynamic: false },
    ]

    const nameMap = assignNames(entries)

    expect(nameMap.get(0)).toBe('node0')
    expect(nameMap.get(1)).toBe('node1')
    expect(nameMap.get(2)).toBe('node2')
    expect(nameMap.size).toBe(3)
  })

  it('skips dynamic entries', () => {
    const entries: NodeEntry[] = [
      { nodeIndex: 0, classNames: ['flex'], span: { start: 0, end: 10 }, isDynamic: false },
      { nodeIndex: 1, classNames: ['bg-blue'], span: { start: 20, end: 30 }, isDynamic: true },
      { nodeIndex: 2, classNames: ['p-4'], span: { start: 40, end: 50 }, isDynamic: false },
    ]

    const nameMap = assignNames(entries)

    expect(nameMap.get(0)).toBe('node0')
    expect(nameMap.has(1)).toBe(false) // dynamic entry skipped
    expect(nameMap.get(2)).toBe('node2')
    expect(nameMap.size).toBe(2)
  })

  it('handles empty entries', () => {
    const nameMap = assignNames([])
    expect(nameMap.size).toBe(0)
  })

  it('handles all dynamic entries', () => {
    const entries: NodeEntry[] = [
      { nodeIndex: 0, classNames: ['flex'], span: { start: 0, end: 10 }, isDynamic: true },
      { nodeIndex: 1, classNames: ['text-sm'], span: { start: 20, end: 30 }, isDynamic: true },
    ]

    const nameMap = assignNames(entries)
    expect(nameMap.size).toBe(0)
  })
})

describe('selectorFor', () => {
  it('returns .node0 for index 0', () => {
    expect(selectorFor(0)).toBe('.node0')
  })

  it('returns .node5 for index 5', () => {
    expect(selectorFor(5)).toBe('.node5')
  })
})
