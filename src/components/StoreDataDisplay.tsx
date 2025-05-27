import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProductCard from "./ProductCard";
import { formatCurrency } from "@/lib/utils";

interface StoreDataDisplayProps {
  stores: Array<{
    id: string;
    url: string;
    isValid: boolean | null;
    isLoading: boolean;
    data: any | null;
    error: string | null;
  }>;
}

interface Product {
  id: string; // Changed from string | number to string
  title: string;
  handle: string; // Added
  body_html?: string;
  published_at: string; // Added
  created_at: string; // Added
  updated_at: string; // Added
  vendor: string; // Added
  product_type: string; // Added
  tags: string[]; // Added
  variants: { price: string; compare_at_price?: string | null; [key: string]: any }[]; // Modified
  images?: { src: string; id?: string; position?: number; [key: string]: any }[]; // Modified
  storeId: string;
  storeUrl: string;
  currency_code?: string;
}

const StoreDataDisplay = ({ stores }: StoreDataDisplayProps) => {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const storesWithData = stores.filter(store => store.data);

  if (storesWithData.length === 0) {
    return null;
  }

  // Create tabs for each store and a tab for overview
  const tabs = [
    { id: "overview", label: "Overview" },
    ...storesWithData.map(store => ({
      id: store.id,
      label: new URL(store.url.startsWith("http") ? store.url : `https://${store.url}`).hostname
    }))
  ];

  // Get all products from all stores
  const allProducts: Product[] = storesWithData.flatMap(store =>
    (store.data?.products || []).map((product: any): Product => ({
      ...product, // Spread all properties from the source product
      id: String(product.id), // Ensure id is a string
      title: product.title,
      handle: product.handle, // Added
      body_html: product.body_html,
      published_at: product.published_at, // Added
      created_at: product.created_at, // Added
      updated_at: product.updated_at, // Added
      vendor: product.vendor, // Added
      product_type: product.product_type, // Added
      tags: product.tags, // Added
      variants: product.variants,
      images: product.images,
      storeId: store.id,
      storeUrl: store.url,
      currency_code: store.data?.currency_code,
    }))
  );

  // Sort products by price for comparison
  const sortedProducts: Product[] = [...allProducts].sort((a, b) => {
    const priceA = parseFloat(a.variants[0]?.price || "0");
    const priceB = parseFloat(b.variants[0]?.price || "0");
    return priceA - priceB;
  });

  // Group products by store for the overview section
  const productsByStore: Record<string, Product[]> = sortedProducts.reduce((acc, product) => {
    const storeHostname = new URL(product.storeUrl.startsWith("http") ? product.storeUrl : `https://${product.storeUrl}`).hostname;
    if (!acc[storeHostname]) {
      acc[storeHostname] = [];
    }
    acc[storeHostname].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {tabs.map(tab => (
            <TabsTrigger 
              key={tab.id} 
              value={tab.id}
              className="text-xs sm:text-sm truncate"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        
        <TabsContent value="overview" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Competitor Pricing Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium text-sm mb-3">Products by Price (Lowest to Highest)</h3>
                    <ScrollArea className="h-[400px] rounded-md border">
                      <div className="p-4">
                        {Object.entries(productsByStore).map(([storeName, products]: [string, Product[]]) => ( // Explicitly type products here
                          <div key={storeName} className="mb-4">
                            <h4 className="text-sm font-semibold mb-2 sticky top-0 bg-white z-10 py-1">{storeName}</h4>
                            {products.map((product: Product) => ( // Explicitly type product here
                              <div key={`${product.storeId}-${product.id}`} className="py-2 border-b last:border-0 flex items-center justify-between">
                                <div className="flex items-center space-x-3 w-[85%]">
                                  {product.images && product.images.length > 0 && (
                                    <img
                                      src={product.images[0].src}
                                      alt={product.title}
                                      className="w-10 h-10 object-cover rounded-md"
                                    />
                                  )}
                                  <div className="flex flex-col items-start">
                                    <p className="text-sm font-medium flex-1">{product.title}</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-end text-sm w-[15%]">
                                  <span className="font-medium">
                                    {formatCurrency(product.variants[0]?.price || "0", product.currency_code || "USD")}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-sm mb-3">Store Statistics</h3>
                    <div className="space-y-4">
                      {storesWithData.map(store => (
                        <Card key={store.id} className="p-4">
                          <h4 className="font-medium truncate">
                            {new URL(store.url.startsWith("http") ? store.url : `https://${store.url}`).hostname}
                          </h4>
                          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                            <div>
                              <p className="text-gray-500">Products</p>
                              <p className="font-medium">{store.data?.products?.length || 0}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Avg. Price</p>
                              <p className="font-medium">
                                {formatCurrency(calculateAveragePrice(store.data?.products || []), store.data?.currency_code || "USD")}
                              </p>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {storesWithData.map(store => (
          <TabsContent key={store.id} value={store.id} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {new URL(store.url.startsWith("http") ? store.url : `https://${store.url}`).hostname}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(store.data?.products || []).map((product: any) => (
                    <ProductCard key={product.id} product={{...product, id: String(product.id), currency_code: store.data?.currency_code || "USD"} as Product} /> // Ensure id is string
                  ))}
                </div>
                
                {(store.data?.products?.length || 0) === 0 && (
                  <p className="text-center py-10 text-gray-500">No products found for this store.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

// Helper function to calculate average price of products
function calculateAveragePrice(products: Product[]): string { // Use Product type here
  if (!products || products.length === 0) return "0.00";
  
  const total = products.reduce((sum, product) => {
    const price = parseFloat(product.variants[0]?.price || "0"); // Ensure price is treated as string for parseFloat
    return sum + price;
  }, 0);
  
  return (total / products.length).toFixed(2);
}

export default StoreDataDisplay;
