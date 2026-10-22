import type { Item } from '../types/domain.js'

/**
 * Deterministic seed data for the in-memory store (documented in the README
 * as "mock dataset"). Includes values that force CSV escaping (quotes,
 * commas, newlines) so the CSV export behavior is covered by the data itself.
 */
let seedCounter = 0
function seed(name: string, category: Item['category'], price: number, description = ''): Item {
  seedCounter += 1
  const createdAt = new Date(Date.UTC(2026, 0, 10, 9, 0, seedCounter)).toISOString()
  return {
    id: `itm_${seedCounter}`,
    name,
    description,
    category,
    price,
    createdAt,
    updatedAt: createdAt,
  }
}

export const SEED_ITEMS: readonly Item[] = [
  seed('USB-C Dock, 4K/90Hz', 'electronics', 8990, 'Eight-port docking station with pass-through charging'),
  seed('Mechanical Keyboard "Quiet Pro"', 'electronics', 15999, 'Silent tactile switches, ANSI layout'),
  seed(
    'The Pragmatic Async App',
    'books',
    3425,
    "Chapter 3: 'Why event loops block' starts with:\nawait new Promise(...)",
  ),
  seed('Standing Desk Kit', 'home', 42500),
  seed('All-weather Trail Tent', 'outdoor', 27995, 'Fits two people, 2.1 kg packed weight'),
  seed('Smart Plant Sensor, Wi-Fi', 'electronics', 2490, 'Battery-powered soil moisture sensor'),
  seed('Cast Iron Skillet, 26cm', 'home', 4500, 'Pre-seasoned, oven safe to 260 C'),
  seed('Yoga Mats, Pair', 'fitness', 6200),
  seed('Cycling Jersey, "Hill Climb" edition', 'fitness', 5490, 'Reflective piping, three rear pockets'),
  seed('Field Notebook Bundle', 'books', 875, 'Five DINA5 notebooks; line, dot & grid layouts'),
  seed('Trail Running Vest, 5L', 'outdoor', 9400),
  seed('Monitor Light Bar', 'electronics', 6300, 'Front-lit, flicker-free, USB powered'),
  seed('Espresso Machine 15 bar', 'home', 28900),
  seed('Kettlebell 16kg', 'fitness', 7300),
  seed('Low-latency Decode Proxy Builder', 'books', 4100, 'Workbook covering streams & backpressure'),
  seed('Portable SSD 2TB', 'electronics', 16990),
  seed('Window Sill Herb Planter', 'home', 1950),
  seed('Insulated Bottle 750ml', 'outdoor', 3200),
  seed('Adjustable Dumbbells 24kg', 'fitness', 39400),
  seed('Weatherproof Speaker, IP67', 'electronics', 8750, 'Pairing two units gives stereo mode'),
]
