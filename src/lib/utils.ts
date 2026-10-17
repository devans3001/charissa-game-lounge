/**
 * Utility functions for currency, dates, and numbers.
 */

// Format integer kobo into Nigerian Naira (₦) string
export function formatNaira(kobo: number): string {
  const naira = (kobo || 0) / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(naira).replace('NGN', '₦');
}

// Format date in Lagos timezone
export function formatLagosDate(isoOrDateString: string): string {
  try {
    const d = new Date(isoOrDateString);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return isoOrDateString;
  }
}

// Format time in Lagos timezone
export function formatLagosTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoString;
  }
}

// Format full datetime in Lagos timezone
export function formatLagosDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoString;
  }
}

// Get today's YYYY-MM-DD in Lagos timezone
export function getTodayLagosString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Helper to convert naira input (e.g. "2000" or "2,000") to integer kobo
export function nairaToKobo(nairaStr: string | number): number {
  if (typeof nairaStr === 'number') {
    return Math.round(nairaStr * 100);
  }
  const clean = nairaStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

// Helper to convert kobo to naira number
export function koboToNaira(kobo: number): number {
  return (kobo || 0) / 100;
}

// Validate and normalize Nigerian phone numbers (e.g. 08012345678, +2348012345678)
export function validateAndNormalizeNigerianPhone(phone: string): {
  isValid: boolean;
  normalized?: string;
  error?: string;
} {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, error: 'Phone number is required.' };
  }
  let clean = phone.trim().replace(/[\s\-\(\)\.]/g, '');
  if (clean.startsWith('+234')) {
    clean = '0' + clean.slice(4);
  } else if (clean.startsWith('234') && clean.length === 13) {
    clean = '0' + clean.slice(3);
  }

  // Nigerian numbers start with 0 and 7, 8, or 9, then 0 or 1, and 8 digits (total 11 digits)
  const regex = /^0[789][01]\d{8}$/;
  if (!regex.test(clean)) {
    return {
      isValid: false,
      error: 'Please enter a valid 11-digit Nigerian mobile number starting with 070, 080, 081, 090, or 091 (e.g. 08012345678 or +234...).',
    };
  }

  return { isValid: true, normalized: clean };
}
