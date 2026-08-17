import { describe, it, expect } from 'vitest'
import { parseImeiRows, dedupeImeiRows } from '@/lib/imei-intake'

describe('parseImeiRows', () => {
  it('parses a bare IMEI per line', () => {
    expect(parseImeiRows('353915090000001\n353915090000002')).toEqual([
      { imei: '353915090000001', serial_number: undefined },
      { imei: '353915090000002', serial_number: undefined },
    ])
  })

  it('parses "IMEI, serial" pairs', () => {
    expect(parseImeiRows('353915090000001, SN-ABC123')).toEqual([
      { imei: '353915090000001', serial_number: 'SN-ABC123' },
    ])
  })

  it('strips internal whitespace from a pasted IMEI', () => {
    expect(parseImeiRows('3539 1509 0000001')).toEqual([
      { imei: '353915090000001', serial_number: undefined },
    ])
  })

  it('drops blank lines and lines with a too-short IMEI', () => {
    expect(parseImeiRows('353915090000001\n\n12\n   \n353915090000002')).toEqual([
      { imei: '353915090000001', serial_number: undefined },
      { imei: '353915090000002', serial_number: undefined },
    ])
  })

  it('handles CRLF line endings from a Windows-exported file', () => {
    expect(parseImeiRows('353915090000001\r\n353915090000002')).toHaveLength(2)
  })

  it('returns an empty array for empty input', () => {
    expect(parseImeiRows('')).toEqual([])
  })
})

describe('dedupeImeiRows', () => {
  it('keeps the first occurrence and drops later duplicates', () => {
    const rows = [
      { imei: 'A', serial_number: 'first' },
      { imei: 'B', serial_number: undefined },
      { imei: 'A', serial_number: 'second' },
    ]
    expect(dedupeImeiRows(rows)).toEqual([
      { imei: 'A', serial_number: 'first' },
      { imei: 'B', serial_number: undefined },
    ])
  })

  it('is a no-op when every IMEI is unique', () => {
    const rows = [{ imei: 'A' }, { imei: 'B' }, { imei: 'C' }]
    expect(dedupeImeiRows(rows)).toEqual(rows)
  })

  it('handles an empty batch', () => {
    expect(dedupeImeiRows([])).toEqual([])
  })
})
