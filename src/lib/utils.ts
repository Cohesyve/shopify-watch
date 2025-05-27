import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number | string,
  currencyCode: string
): string {
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) {
    return ""; // Or a default like "N/A"
  }
  try {
    return new Intl.NumberFormat(undefined, {
      // Use user's locale for formatting conventions
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch (error) {
    console.warn(`Failed to format currency for ${currencyCode}:`, error);
    // Fallback for invalid currency codes or other errors
    return `${currencyCode} ${numericAmount.toFixed(2)}`;
  }
}
