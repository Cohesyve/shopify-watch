
/**
 * Utility functions for interacting with Shopify stores
 */

/**
 * Validates if a URL belongs to a Shopify store by checking
 * if it responds to /products.json endpoint
 */
export const validateShopifyUrl = async (url: string): Promise<boolean> => {
  try {
    // Normalize the URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    
    // Remove trailing slash if present
    if (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }
    
    const response = await fetch(`${normalizedUrl}/products.json`, {
      method: 'HEAD',
    });
    
    return response.ok;
  } catch (error) {
    console.error("Error validating Shopify URL:", error);
    return false;
  }
};

/**
 * Fetches store data from a validated Shopify store
 */
export const fetchStoreData = async (url: string) => {
  try {
    // Normalize the URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    
    // Remove trailing slash if present
    if (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }
    
    const response = await fetch(`${normalizedUrl}/products.json`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching store data:", error);
    throw error;
  }
};
