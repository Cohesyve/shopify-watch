
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProductCard from "./ProductCard";

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
  const allProducts = storesWithData.flatMap(store => 
    (store.data?.products || []).map((product: any) => ({
      ...product,
      storeId: store.id,
      storeUrl: store.url
    }))
  );

  // Sort products by price for comparison
  const sortedProducts = [...allProducts].sort((a, b) => {
    const priceA = parseFloat(a.variants[0]?.price || "0");
    const priceB = parseFloat(b.variants[0]?.price || "0");
    return priceA - priceB;
  });

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
                        {sortedProducts.map((product, idx) => (
                          <div key={`${product.storeId}-${product.id}`} className="py-2 border-b last:border-0">
                            <p className="font-medium">{product.title}</p>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">
                                {new URL(product.storeUrl.startsWith("http") ? product.storeUrl : `https://${product.storeUrl}`).hostname}
                              </span>
                              <span className="font-medium">
                                ${parseFloat(product.variants[0]?.price || "0").toFixed(2)}
                              </span>
                            </div>
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
                                ${calculateAveragePrice(store.data?.products || [])}
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
                    <ProductCard key={product.id} product={product} />
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
function calculateAveragePrice(products: any[]): string {
  if (!products || products.length === 0) return "0.00";
  
  const total = products.reduce((sum, product) => {
    const price = parseFloat(product.variants[0]?.price || "0");
    return sum + price;
  }, 0);
  
  return (total / products.length).toFixed(2);
}

export default StoreDataDisplay;
