import { serve } from 'https://deno.land/std@0.207.0/http/server.ts';

// Helper function to normalize titles (ported from Python)
function normalizeTitle(title: string): string {
  title = title.toLowerCase();
  title = title.replace(/[^\w\s]/g, " "); // Remove non-alphanumeric characters
  title = title.replace(/\s+/g, " ").trim(); // Replace multiple spaces with a single space
  return title;
}

// Function to strip HTML tags
function stripHtmlTags(html?: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();
}

// Simplified TF-IDF and Cosine Similarity
// This is a basic implementation. For production, consider more robust libraries
// or alternative lightweight string similarity algorithms if performance is critical.
class SimpleTfIdf {
  private corpus: string[][] = [];
  private vocab: string[] = [];
  private idf: { [term: string]: number } = {};

  constructor(documents: string[]) {
    const tokenizedDocuments = documents.map(doc => normalizeTitle(doc).split(' '));
    this.corpus = tokenizedDocuments;

    const termDocCounts: { [term: string]: number } = {};
    const vocabSet = new Set<string>();

    for (const docTokens of tokenizedDocuments) {
      const seenInDoc = new Set<string>();
      for (const token of docTokens) {
        vocabSet.add(token);
        if (!seenInDoc.has(token)) {
          termDocCounts[token] = (termDocCounts[token] || 0) + 1;
          seenInDoc.add(token);
        }
      }
    }
    this.vocab = Array.from(vocabSet);

    const numDocuments = documents.length;
    for (const term of this.vocab) {
      this.idf[term] = Math.log(numDocuments / (termDocCounts[term] || 1)) + 1;
    }
  }

  transform(documents: string[]): number[][] {
    return documents.map(doc => {
      const normalizedDoc = normalizeTitle(doc);
      const tokens = normalizedDoc.split(' ');
      const termCounts: { [term: string]: number } = {};
      for (const token of tokens) {
        termCounts[token] = (termCounts[token] || 0) + 1;
      }

      const vector = this.vocab.map(term => {
        const tf = (termCounts[term] || 0) / (tokens.length || 1);
        return tf * (this.idf[term] || 0);
      });
      return vector;
    });
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  if (vecA.length !== vecB.length) return 0; // Vectors must be of the same length

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
    normA += (vecA[i] || 0) * (vecA[i] || 0);
    normB += (vecB[i] || 0) * (vecB[i] || 0);
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Ported is_similar function
function isSimilar(title1: string, title2: string, threshold: number = 0.25): boolean {
  // console.log(`Comparing '${title1}' with '${title2}'`); // For debugging in Supabase logs

  const text1 = title1.trim();
  const text2 = title2.trim();

  const documents = [text1, text2].filter(doc => doc && doc.trim() !== "");
  if (documents.length < 2) return false; // Cannot compare if one title is empty

  const tfidf = new SimpleTfIdf(documents);
  const vectors = tfidf.transform(documents);

  if (vectors.length < 2 || !vectors[0] || !vectors[1] || vectors[0].length === 0 || vectors[1].length === 0) {
    return false;
  }

  const similarity = cosineSimilarity(vectors[0], vectors[1]);
  console.log(`Comparing (normalized): "${text1}" AND "${text2}" --- Similarity Score: ${similarity}`);
  return similarity >= threshold;
}

// Ported get_pricing_suggestions function
interface PricingSuggestions {
  undercut_lower: number;
  undercut_avg: number;
  lowest_price_match: number;
  slight_premium: number;
  premium: number;
}

function getPricingSuggestions(ourPrice: number, competitorPrices: number[]): PricingSuggestions {
  if (!competitorPrices || competitorPrices.length === 0) {
    return {
      undercut_lower: parseFloat(ourPrice.toFixed(2)),
      undercut_avg: parseFloat(ourPrice.toFixed(2)),
      lowest_price_match: parseFloat(ourPrice.toFixed(2)),
      slight_premium: parseFloat(ourPrice.toFixed(2)),
      premium: parseFloat(ourPrice.toFixed(2)),
    };
  }

  const avgPrice = competitorPrices.reduce((sum, p) => sum + p, 0) / competitorPrices.length;
  const lowestPrice = Math.min(...competitorPrices);
  const highestPrice = Math.max(...competitorPrices);

  return {
    undercut_lower: parseFloat((lowestPrice * 0.95).toFixed(2)),
    undercut_avg: parseFloat((avgPrice * 0.95).toFixed(2)),
    lowest_price_match: parseFloat(lowestPrice.toFixed(2)),
    slight_premium: parseFloat((avgPrice * 1.1).toFixed(2)),
    premium: parseFloat((highestPrice * 1.05).toFixed(2)),
  };
}

// Define types for input data
interface Variant {
  title: string;
  price: string | number;
  // description?: string; // Removed, body_html from Product will be used
}

interface Product {
  title: string;
  variants: Variant[];
  // description?: string; // Removed in favor of body_html
  body_html?: string; // Added body_html for richer content
}

interface CompanyData { // Represents "our_data"
  products: Product[];
}

// New input type for individual competitor data
interface CompetitorStoreInput {
  store_identifier: string; // e.g., hostname or unique URL
  products: Product[];
}

// Define types for output data
interface MatchedCompetitorVariantDetail {
    competitor_product_title: string;
    competitor_variant_title: string;
    price: number;
}

interface OurProductSuggestion {
    title: string; // Our product title
    variant_title: string; // Our variant title
    current_price: number; // Our price
    suggested_prices: PricingSuggestions; // This interface (PricingSuggestions) remains the same
    matched_competitor_variants_from_this_competitor: MatchedCompetitorVariantDetail[];
}

interface SuggestionsByCompetitor {
    competitor_store_identifier: string;
    suggestions_for_our_products: OurProductSuggestion[];
}

// Modified function to generate suggestions per competitor
function suggestPricingAgainstCompetitors(
  ourData: CompanyData,
  competitorStoresData: CompetitorStoreInput[],
  productLimit: number = 30 // Added default value for productLimit
): SuggestionsByCompetitor[] {
  const allSuggestionsByCompetitor: SuggestionsByCompetitor[] = [];

  if (!ourData || !ourData.products || !competitorStoresData) {
    return allSuggestionsByCompetitor;
  }

  const ourProductsToProcess = productLimit ? ourData.products.slice(0, productLimit) : ourData.products;

  for (const competitorStore of competitorStoresData) {
    const currentCompetitorSuggestions: OurProductSuggestion[] = [];
    if (!competitorStore.products) continue;

    const competitorProductsToProcess = productLimit ? competitorStore.products.slice(0, productLimit) : competitorStore.products;

    for (const ourProduct of ourProductsToProcess) { // Use sliced array
      const ourProductTitle = ourProduct.title;
      if (!ourProduct.variants) continue;

      for (const ourVariant of ourProduct.variants) {
        const ourVariantTitle = ourVariant.title;
        const ourPrice = parseFloat(ourVariant.price as string);

        if (isNaN(ourPrice)) continue;

        const competitorPricesForThisStore: number[] = [];
        const matchedVariantsFromThisStore: MatchedCompetitorVariantDetail[] = [];

        for (const compProduct of competitorProductsToProcess) { // Use sliced array
          if (!compProduct.variants) continue;
          for (const compVariant of compProduct.variants) {
            const combinedOurTitle = `${ourProductTitle} ${ourVariant.title}`.trim();
            const combinedCompetitorTitle = `${compProduct.title} ${compVariant.title}`.trim();

            // Use body_html from product for comparison
            if (isSimilar(combinedOurTitle, combinedCompetitorTitle)) {
              try {
                const price = parseFloat(compVariant.price as string);
                if (price > 0 && !isNaN(price)) {
                  competitorPricesForThisStore.push(price);
                  matchedVariantsFromThisStore.push({
                    competitor_product_title: compProduct.title,
                    competitor_variant_title: compVariant.title,
                    price: price,
                  });
                }
              } catch (e) {
                console.error("Error processing competitor variant price:", e);
                // Continue to next competitor variant
              }
            }
          }
        }
        
        // Only generate suggestions if there were matches from this specific competitor
        if (matchedVariantsFromThisStore.length > 0) {
          const pricingOptions = getPricingSuggestions(ourPrice, competitorPricesForThisStore);
          currentCompetitorSuggestions.push({
            title: ourProductTitle,
            variant_title: ourVariantTitle,
            current_price: ourPrice,
            suggested_prices: pricingOptions,
            matched_competitor_variants_from_this_competitor: matchedVariantsFromThisStore,
          });
        }
      }
    }
    // Only add this competitor if there are any suggestions related to them
    if (currentCompetitorSuggestions.length > 0) {
      allSuggestionsByCompetitor.push({
        competitor_store_identifier: competitorStore.store_identifier,
        suggestions_for_our_products: currentCompetitorSuggestions,
      });
    }
  }
  return allSuggestionsByCompetitor;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Consider restricting this to your frontend's domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // Added to specify allowed methods
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const body = await req.json();
    // Updated to expect our_data and competitor_stores_data
    const { our_data, competitor_stores_data, product_limit } = body; // Added product_limit

    if (!our_data || !competitor_stores_data) {
      return new Response(JSON.stringify({ error: 'Missing our_data or competitor_stores_data in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Ensure competitor_stores_data is an array
    if (!Array.isArray(competitor_stores_data)) {
      return new Response(JSON.stringify({ error: 'competitor_stores_data must be an array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suggestions = suggestPricingAgainstCompetitors(our_data, competitor_stores_data, product_limit); // Pass product_limit

    return new Response(JSON.stringify(suggestions), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in Edge Function:", error); // Log the raw error

    let errorMessage = 'An unexpected error occurred';
    const errorStatus = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string' && error.trim() !== '') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim() !== '') {
      errorMessage = error.message;
    } else if (error !== null && error !== undefined) {
      try {
        const stringifiedError = String(error);
        if (stringifiedError.trim() !== '' && stringifiedError !== '[object Object]') {
          errorMessage = stringifiedError;
        }
      } catch (e) {
        // If String(error) fails or results in a generic object string, stick to the default message
      }
    }
    // If error was null, undefined, or could not be meaningfully stringified,
    // errorMessage remains 'An unexpected error occurred'.

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: errorStatus,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/*
Example Input JSON for testing:
{
  "our_data": {
    "products": [
      {
        "title": "Our Awesome T-Shirt",
        "body_html": "<p>A <b>really comfortable</b> t-shirt made from <em>premium cotton</em>.</p>",
        "variants": [
          { "title": "Red", "price": "20.00" },
          { "title": "Blue", "price": "22.00" }
        ]
      }
    ]
  },
  "competitor_stores_data": [
    {
      "store_identifier": "competitorA.com",
      "products": [
        {
          "title": "Competitor Cool T-Shirt",
          "body_html": "<div>A cool tee for everyday wear, <span>100% cotton</span>.</div>",
          "variants": [
            { "title": "Red", "price": "19.00" },
            { "title": "Blue", "price": "21.00" }
          ]
        }
      ]
    },
    {
      "store_identifier": "anotherbrand.net",
      "products": [
        {
          "title": "Another Brand Tee",
          "body_html": "Basic t-shirt, good value.", // Plain text also works
          "variants": [
            { "title": "Red", "price": "23.00" }
          ]
        },
        {
          "title": "Our Awesome T-Shirt Blue",
          "body_html": "<p>Just like your favorite blue shirt!</p>",
          "variants": [
            { "title": "", "price": "20.50" }
          ]
        }
      ]
    }
  ],
  "product_limit": 10
}
*/
