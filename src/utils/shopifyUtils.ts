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
      method: 'GET',
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
export const fetchStoreData = async (url: string): Promise<{ products: any[], currency_code: string | null }> => {
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
    
    const productsResponse = await fetch(`${normalizedUrl}/products.json`);
    
    if (!productsResponse.ok) {
      throw new Error(`Failed to fetch products.json: ${productsResponse.status}`);
    }
    
    const productsData = await productsResponse.json();
    const products = productsData.products || [];

    let currency_code: string | null = null;
    try {
      const metaResponse = await fetch(`${normalizedUrl}/meta.json`);
      if (metaResponse.ok) {
        const metaData = await metaResponse.json();
        if (metaData && metaData.currency) {
          currency_code = metaData.currency;
        }
      } else {
        console.warn(`Failed to fetch /meta.json for ${normalizedUrl}: Status ${metaResponse.status}`);
      }
    } catch (metaError) {
      console.warn(`Could not fetch or parse /meta.json for ${normalizedUrl}:`, metaError);
    }

    return { products, currency_code };
  } catch (error) {
    console.error("Error fetching store data for " + url + ":", error);
    // Ensure the function still matches the expected return type in case of an error before the final return
    if (error instanceof Error && error.message.startsWith("Failed to fetch products.json")) {
        throw error; // rethrow specific error
    }
    // For other errors, or to ensure type compatibility if we decide to return instead of throwing
    // return { products: [], currency_code: null }; 
    throw error; // It's generally better to rethrow to let the caller handle UI updates for errors
  }
};
