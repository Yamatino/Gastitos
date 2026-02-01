// Service to fetch official inflation data from Argentina
const INFLATION_API_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion'

export interface InflationData {
  fecha: string
  valor: number
}

export interface ProcessedInflation {
  latest: InflationData | null
  lastSixMonths: InflationData[]
  cumulativeSixMonths: number
}

// Cache inflation data for 24 hours
let cachedData: ProcessedInflation | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export async function fetchInflationData(): Promise<ProcessedInflation> {
  // Check cache
  const now = Date.now()
  if (cachedData && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedData
  }

  try {
    const response = await fetch(INFLATION_API_URL)
    if (!response.ok) {
      throw new Error('Failed to fetch inflation data')
    }

    const data: InflationData[] = await response.json()
    
    // Get last 6 months of data
    const lastSixMonths = data.slice(-6)
    
    // Calculate cumulative inflation over 6 months
    // Formula: (1 + r1) * (1 + r2) * ... * (1 + rn) - 1
    const cumulativeSixMonths = lastSixMonths.reduce(
      (acc, month) => acc * (1 + month.valor / 100),
      1
    ) - 1

    const processed: ProcessedInflation = {
      latest: data[data.length - 1] || null,
      lastSixMonths,
      cumulativeSixMonths: cumulativeSixMonths * 100 // Convert to percentage
    }

    // Update cache
    cachedData = processed
    cacheTimestamp = now

    return processed
  } catch (error) {
    console.error('Error fetching inflation data:', error)
    // Return default values if API fails
    return {
      latest: null,
      lastSixMonths: [],
      cumulativeSixMonths: 0
    }
  }
}

// Calculate inflation-adjusted amount
export function adjustForInflation(
  amount: number,
  monthsAgo: number,
  monthlyInflationRates: number[]
): number {
  if (monthsAgo <= 0 || monthlyInflationRates.length === 0) {
    return amount
  }

  // Get the relevant inflation rates (most recent first)
  const relevantRates = monthlyInflationRates.slice(-monthsAgo)
  
  // Calculate cumulative inflation
  const cumulativeInflation = relevantRates.reduce(
    (acc, rate) => acc * (1 + rate / 100),
    1
  )

  // Adjust amount
  return amount * cumulativeInflation
}

// Format inflation value with disclaimer if using default
export function formatInflationRate(rate: number | null, isLatest: boolean): string {
  if (rate === null) {
    return 'N/A'
  }
  
  const formatted = rate.toFixed(1)
  
  if (isLatest) {
    // Last official data
    return `${formatted}%`
  }
  
  return `${formatted}%`
}
