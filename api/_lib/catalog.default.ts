import type { Catalog } from './billing.js'

/**
 * The price list as it is in the app's code, used until one is saved in the Console
 * (platformConfig/pricing). tests/billing.test.ts fails if this drifts from src/lib/editions.ts.
 */
export const DEFAULT_CATALOG: Catalog = {
  lecturers: [
    { id: 'lecturers-0', name: 'Free', priceMyr: 0, priceUsd: 0, cycle: 'free' },
    { id: 'lecturers-1', name: 'Pro', priceMyr: 19, priceUsd: 5, cycle: 'month', noteMyr: 'Or RM190 a year: 12 months for the price of 10.', noteUsd: 'Or $50 a year: 12 months for the price of 10.' },
    { id: 'lecturers-2', name: 'Faculty', priceMyr: 15, priceUsd: 4, cycle: 'month', noteMyr: 'From 5 lecturers. Or RM150 a lecturer a year.', noteUsd: 'From 5 lecturers. Or $40 a lecturer a year.', perSeat: true, minSeats: 5 },
  ],
  trainers: [
    { id: 'trainers-0', name: 'Free', priceMyr: 0, priceUsd: 0, cycle: 'free' },
    { id: 'trainers-1', name: 'Pro', priceMyr: 39, priceUsd: 9, cycle: 'month', noteMyr: 'Or RM390 a year: 12 months for the price of 10.', noteUsd: 'Or $90 a year: 12 months for the price of 10.' },
  ],
  workplace: [
    { id: 'workplace-0', name: 'Free', priceMyr: 0, priceUsd: 0, cycle: 'free', seats: 5 },
    { id: 'workplace-1', name: 'Pro 20', priceMyr: 49, priceUsd: 12, cycle: 'month', seats: 20 },
    { id: 'workplace-2', name: 'Pro 50', priceMyr: 99, priceUsd: 24, cycle: 'month', seats: 50 },
    { id: 'workplace-3', name: 'Pro 100', priceMyr: 179, priceUsd: 45, cycle: 'month', seats: 100 },
  ],
}
