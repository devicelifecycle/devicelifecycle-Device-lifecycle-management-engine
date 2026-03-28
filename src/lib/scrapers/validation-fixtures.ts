import type { DeviceToScrape } from './types'

export const commonValidationDevices: DeviceToScrape[] = [
  { make: 'Apple', model: 'iPhone 15 Pro', storage: '128GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'excellent' },
  { make: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB', condition: 'fair' },
  { make: 'Google', model: 'Pixel 8 Pro', storage: '128GB', condition: 'good' },
]

export const univercellValidationDevices: DeviceToScrape[] = [
  { make: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 15 Pro Max', storage: '512GB', condition: 'excellent' },
  { make: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB', condition: 'fair' },
  { make: 'Google', model: 'Pixel 8 Pro', storage: '128GB', condition: 'good' },
  { make: 'Apple', model: 'Apple Watch Series 9', storage: 'GPS Only | Aluminum', condition: 'broken' },
]

export const appleValidationDevices: DeviceToScrape[] = [
  { make: 'Apple', model: 'iPhone 15', storage: '128GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', condition: 'excellent' },
  { make: 'Apple', model: 'Apple Watch Series 9', storage: 'N/A', condition: 'fair' },
  { make: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB', condition: 'good' },
]

export const edgeStorageFixtures: DeviceToScrape[] = [
  { make: 'Apple', model: 'iPhone 13 mini', storage: '64GB', condition: 'excellent' },
  { make: 'Apple', model: 'iPhone 15', storage: '128GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', condition: 'fair' },
  { make: 'Apple', model: 'iPhone 15 Pro Max', storage: '512GB', condition: 'broken' },
  { make: 'Samsung', model: 'Galaxy S24 Ultra', storage: '1TB', condition: 'good' },
]

export const variantAndTypoFixtures: DeviceToScrape[] = [
  { make: 'Apple', model: 'iphone 15 pro', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone15 Pro Max', storage: '512GB', condition: 'excellent' },
  { make: 'Samsung', model: 'Galaxy S24Ultra', storage: '256GB', condition: 'fair' },
  { make: 'Google', model: 'Pixel8 Pro', storage: '128GB', condition: 'good' },
]

export const expectedNoResultFixtures: DeviceToScrape[] = [
  { make: 'Nokia', model: '3310', storage: '64MB', condition: 'good' },
  { make: 'BlackBerry', model: 'Passport', storage: '32GB', condition: 'fair' },
]
