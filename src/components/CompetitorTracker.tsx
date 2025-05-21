
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import StoreDataDisplay from "@/components/StoreDataDisplay";
import { fetchStoreData, validateShopifyUrl } from "@/utils/shopifyUtils";

interface CompetitorStore {
  id: string;
  url: string;
  isValid: boolean | null;
  isLoading: boolean;
  data: any | null;
  error: string | null;
}

const CompetitorTracker = () => {
  const { toast } = useToast();
  const [stores, setStores] = useState<CompetitorStore[]>([{ 
    id: crypto.randomUUID(), 
    url: "", 
    isValid: null,
    isLoading: false,
    data: null,
    error: null
  }]);
  const [isFetchingAll, setIsFetchingAll] = useState(false);

  const addStore = () => {
    if (stores.length >= 5) {
      toast({
        title: "Maximum limit reached",
        description: "You can monitor up to 5 stores at a time",
        variant: "destructive"
      });
      return;
    }
    
    setStores([...stores, { 
      id: crypto.randomUUID(), 
      url: "", 
      isValid: null,
      isLoading: false,
      data: null,
      error: null
    }]);
  };

  const removeStore = (id: string) => {
    if (stores.length === 1) {
      setStores([{ 
        id: crypto.randomUUID(), 
        url: "", 
        isValid: null,
        isLoading: false,
        data: null,
        error: null
      }]);
    } else {
      setStores(stores.filter(store => store.id !== id));
    }
  };

  const updateStoreUrl = (id: string, url: string) => {
    setStores(stores.map(store => 
      store.id === id ? { ...store, url, isValid: null, data: null, error: null } : store
    ));
  };

  const validateUrl = async (id: string) => {
    const store = stores.find(s => s.id === id);
    if (!store || !store.url.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive"
      });
      return;
    }

    setStores(stores.map(store => 
      store.id === id ? { ...store, isLoading: true, isValid: null, error: null } : store
    ));

    try {
      const isValid = await validateShopifyUrl(store.url);
      
      setStores(stores.map(store => 
        store.id === id ? { 
          ...store, 
          isLoading: false, 
          isValid,
          error: isValid ? null : "This doesn't appear to be a Shopify store." 
        } : store
      ));

      if (isValid) {
        toast({
          title: "Valid Shopify Store",
          description: "This URL is a valid Shopify store.",
        });
      } else {
        toast({
          title: "Not a Shopify Store",
          description: "This URL doesn't appear to be a Shopify store.",
          variant: "destructive"
        });
      }
    } catch (error) {
      setStores(stores.map(store => 
        store.id === id ? { 
          ...store, 
          isLoading: false, 
          isValid: false,
          error: "Error validating URL. Please check the URL and try again." 
        } : store
      ));

      toast({
        title: "Error",
        description: "Could not validate the URL. Please try again.",
        variant: "destructive"
      });
    }
  };

  const fetchAllData = async () => {
    const validStores = stores.filter(store => store.isValid);
    
    if (validStores.length === 0) {
      toast({
        title: "No valid stores",
        description: "Please add and validate at least one Shopify store URL.",
        variant: "destructive"
      });
      return;
    }

    setIsFetchingAll(true);

    try {
      const updatedStores = [...stores];
      
      for (const store of validStores) {
        const index = updatedStores.findIndex(s => s.id === store.id);
        updatedStores[index] = {
          ...updatedStores[index],
          isLoading: true,
          data: null,
          error: null
        };
      }
      
      setStores(updatedStores);

      for (const store of validStores) {
        try {
          const data = await fetchStoreData(store.url);
          setStores(current => 
            current.map(s => 
              s.id === store.id ? { 
                ...s, 
                isLoading: false, 
                data, 
                error: null 
              } : s
            )
          );
        } catch (error) {
          setStores(current => 
            current.map(s => 
              s.id === store.id ? { 
                ...s, 
                isLoading: false, 
                data: null, 
                error: "Failed to fetch store data." 
              } : s
            )
          );
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch store data. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsFetchingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Add Competitor Stores</h2>
        <div className="space-y-4">
          {stores.map((store) => (
            <div key={store.id} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Enter Shopify store URL (e.g. store-name.myshopify.com)"
                  value={store.url}
                  onChange={(e) => updateStoreUrl(store.id, e.target.value)}
                  className={`${
                    store.isValid === true ? "border-green-500" : 
                    store.isValid === false ? "border-red-500" : ""
                  }`}
                  disabled={store.isLoading}
                />
                {store.error && (
                  <p className="text-xs text-red-500 mt-1">{store.error}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => validateUrl(store.id)}
                  disabled={!store.url || store.isLoading}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => removeStore(store.id)}
                  disabled={store.isLoading}
                >
                  <span className="sr-only">Remove</span>
                  &times;
                </Button>
              </div>
            </div>
          ))}
          
          <div className="flex justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={addStore}
              disabled={stores.length >= 5 || isFetchingAll}
              className="flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> Add another URL
            </Button>
            
            <Button
              onClick={fetchAllData}
              disabled={!stores.some(store => store.isValid) || isFetchingAll}
              className="flex items-center gap-2"
            >
              <ArrowDown className="h-4 w-4" />
              {isFetchingAll ? "Fetching..." : "Fetch All Data"}
            </Button>
          </div>
        </div>
      </div>
      
      <StoreDataDisplay stores={stores} />
    </div>
  );
};

export default CompetitorTracker;
