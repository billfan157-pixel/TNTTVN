import crypto from 'node:crypto'

export type IdPrefix = 'ST' | 'GR' | 'AT' | 'NC' | 'USR' | 'AUD' | 'NOT' | 'CLS' | 'ASG' | 'IMP' | 'CNM' | 'IBS' | 'GIH' | 'MM' | 'SA' | 'GROV' | 'OUT' | 'SML' | 'ATT' | 'PRM' | 'SNA' | 'ASM' | 'EXS' | 'EXR' | 'EXF' | 'EFI' | 'BR' | 'AY' | 'ASN' | 'GRD' | 'S1' | 'S2' | 'STU' | 'ATS' | 'STD' | 'OB' | 'GOV' | 'C1' | 'C2' | 'adm' | 'pa' | 'pb' | 'glv' | 'LRQ' | 'FND' | 'TXN' | 'FEE' | 'ERR'

/**
 * Generates a normalized, collision-resistant domain ID (e.g. ST-4f8a12b9)
 */
export function generateId(prefix: IdPrefix): string {
  const randomHex = crypto.randomUUID().split('-')[0]
  return `${prefix}-${randomHex}`
}
