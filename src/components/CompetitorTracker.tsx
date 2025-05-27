import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, Eye, Save } from "lucide-react"; // Removed ArrowDown as it's not used, kept Eye and Save
import { useToast } from "@/hooks/use-toast";
import StoreDataDisplay from "@/components/StoreDataDisplay";
import { fetchStoreData, validateShopifyUrl } from "@/utils/shopifyUtils";
import { supabase } from "@/integrations/supabase/client"; // Import supabase client
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"; // Import Dialog components
import { Label } from "@/components/ui/label"; // Import Label
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"; // Import Card components for pricing strategies display

interface CompetitorStore {
  id: string;
  url: string;
  isValid: boolean | null;
  isLoading: boolean;
  data: any | null; // Can store product data, etc.
  error: string | null;
}

interface MatchedCompetitorVariantDetail {
  competitor_product_title: string;
  competitor_variant_title: string;
  price: number;
}

interface OurProductSuggestion {
  title: string; // Our product title
  variant_title: string; // Our variant title
  current_price: number; // Our price
  suggested_prices: {
    undercut_lower: number;
    undercut_avg: number;
    lowest_price_match: number;
    slight_premium: number;
    premium: number;
  };
  matched_competitor_variants_from_this_competitor: MatchedCompetitorVariantDetail[];
}

interface SuggestionsByCompetitor {
  competitor_store_identifier: string;
  suggestions_for_our_products: OurProductSuggestion[];
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
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState("");
  const [hasSubscribedThisSession, setHasSubscribedThisSession] = useState(false);
  const [activeTab, setActiveTab] = useState("competitor-data");
  // Updated state for pricing suggestions to match the new API response
  const [pricingSuggestionsByCompetitor, setPricingSuggestionsByCompetitor] = useState<SuggestionsByCompetitor[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [activePricingTab, setActivePricingTab] = useState<string>(""); // To manage active competitor tab

  const getValidStoreUrls = () => stores.filter(store => store.isValid && store.url).map(store => store.url);

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

    setStores(stores.map(s => 
      s.id === id ? { ...s, isLoading: true, isValid: null, error: null } : s
    ));

    try {
      const isValid = await validateShopifyUrl(store.url);
      
      setStores(stores.map(s => 
        s.id === id ? { 
          ...s, 
          isLoading: false, 
          isValid,
          error: isValid ? null : "This doesn't appear to be a Shopify store." 
        } : s
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
      setStores(stores.map(s => 
        s.id === id ? { 
          ...s, 
          isLoading: false, 
          isValid: false,
          error: "Error validating URL. Please check the URL and try again." 
        } : s
      ));

      toast({
        title: "Error",
        description: "Could not validate the URL. Please try again.",
        variant: "destructive"
      });
    }
  };

  const fetchPricingSuggestions = async () => {
    const ourStore = stores.find(store => store.url.includes("ecosys"));
    const competitorStores = stores.filter(store => store.isValid && store.data && !store.url.includes("ecosys"));

    if (!ourStore || !ourStore.data) {
      toast({
        title: "Our Store Data Missing",
        description: "Could not find data for 'ecosys' store to generate pricing strategies.",
        variant: "destructive",
      });
      setPricingSuggestionsByCompetitor([]);
      return;
    }

    if (competitorStores.length === 0) {
      toast({
        title: "No Competitor Data",
        description: "No valid competitor data available to generate pricing strategies.",
        variant: "default",
      });
      setPricingSuggestionsByCompetitor([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const our_data = { products: ourStore.data.products };
      const competitor_stores_data = competitorStores.map(store => {
        let identifier = "unknown-competitor";
        try {
          const fullUrl = store.url.startsWith("http://") || store.url.startsWith("https://") ? store.url : `https://${store.url}`;
          identifier = new URL(fullUrl).hostname;
        } catch (e) {
          identifier = store.url; // fallback
        }
        return {
          store_identifier: identifier,
          products: store.data?.products || []
        };
      });
      
      const { data: suggestions, error } = await supabase.functions.invoke('pricing-suggestions', {
        body: { our_data, competitor_stores_data }, // Updated payload
      });

      if (error) {
        throw error;
      }

      if (suggestions && Array.isArray(suggestions)) {
        setPricingSuggestionsByCompetitor(suggestions);
        if (suggestions.length > 0 && suggestions[0].competitor_store_identifier) {
          setActivePricingTab(suggestions[0].competitor_store_identifier); // Set first competitor tab active
        }
        toast({ title: "Pricing Strategies Updated", description: "Suggestions based on current competitor data." });
      } else {
        setPricingSuggestionsByCompetitor([]);
        toast({ title: "No Suggestions", description: "Could not generate pricing suggestions at this time or format is incorrect.", variant: "default" });
      }
    } catch (error: any) {
      console.error("Error fetching pricing suggestions:", error);
      toast({
        title: "Error Fetching Suggestions",
        description: `Failed to communicate with the pricing service: ${error.message}. Check logs.`,
        variant: "destructive",
      });
      setPricingSuggestionsByCompetitor([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };
  
  useEffect(() => {
    if (activeTab === "pricing-strategies" && stores.some(s => s.data)) {
      fetchPricingSuggestions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // Removed stores from dependency to prevent re-fetch on every store data change, rely on manual refresh or tab switch


  const performDataFetch = async (): Promise<CompetitorStore[]> => {
    setIsFetchingAll(true);
    const storesToProcess = stores.filter(store => store.isValid && store.url);

    if (storesToProcess.length === 0) {
      setIsFetchingAll(false);
      return [];
    }

    setStores(current =>
      current.map(s =>
        storesToProcess.find(stp => stp.id === s.id)
          ? { ...s, isLoading: true, data: null, error: null }
          : s
      )
    );

    const fetchResults: CompetitorStore[] = [];

    for (const store of storesToProcess) {
      try {
        const data = await fetchStoreData(store.url);
        const currentStoreResult = { ...store, isLoading: false, data, error: null };
        setStores(current =>
          current.map(s => (s.id === store.id ? currentStoreResult : s))
        );
        fetchResults.push(currentStoreResult);
      } catch (fetchError: any) {
        const errorMessage = fetchError?.message || "Failed to fetch store data.";
        const currentStoreResult = { ...store, isLoading: false, data: null, error: errorMessage };
        setStores(current =>
          current.map(s => (s.id === store.id ? currentStoreResult : s))
        );
        fetchResults.push(currentStoreResult);
      }
    }

    setIsFetchingAll(false);
    // After fetching data, if the pricing strategies tab is active, refresh suggestions
    if (activeTab === "pricing-strategies" && fetchResults.some(fr => fr.data)) {
      await fetchPricingSuggestions();
    }
    return fetchResults;
  };

  const handlePreviewData = async () => {
    const validStoreUrls = getValidStoreUrls();
    if (validStoreUrls.length === 0) {
      toast({
        title: "No valid stores",
        description: "Please add and validate at least one Shopify store URL to preview data.",
        variant: "destructive"
      });
      return;
    }
    performDataFetch();
  };

  const ensureSubscriptionIsCurrentAndFetch = async () => {
    const currentValidUrls = getValidStoreUrls();

    if (currentValidUrls.length === 0) {
      toast({
        title: "No Valid Stores",
        description: "Please ensure there are valid and validated store URLs to update your subscription.",
        variant: "destructive",
      });
      return;
    }

    setIsFetchingAll(true); 
    try {
      const { data: existingSubscription, error: fetchSubError } = await supabase
        .from('subscriptions')
        .select('id, competitor_urls, is_active')
        .eq('email', email) 
        .single();

      if (existingSubscription) {
        const existingUrls = existingSubscription.competitor_urls || [];
        const urlsHaveChanged = !(currentValidUrls.length === existingUrls.length && currentValidUrls.every(url => existingUrls.includes(url)));

        if (urlsHaveChanged || !existingSubscription.is_active) {
          const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ competitor_urls: currentValidUrls, is_active: true })
            .eq('id', existingSubscription.id);

          if (updateError) {
            console.error("Supabase update error:", updateError);
            toast({
              title: "Subscription Update Failed",
              description: updateError.message || "Could not update your subscription. Please try again.",
              variant: "destructive",
            });
            return;
          }
          toast({ title: "Subscription Updated", description: "Your list of monitored stores has been updated." });
        } else {
          toast({ title: "Stores Already Up-to-Date", description: "Your monitored stores are already up-to-date with your subscription." });
        }
      } else {
        if (fetchSubError && fetchSubError.code !== 'PGRST116') { 
          console.error("Supabase fetch error (ensureSubscription):", fetchSubError);
          toast({ title: "Error Checking Subscription", description: fetchSubError.message, variant: "destructive" });
          return;
        }
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert([{ email, competitor_urls: currentValidUrls, is_active: true }]);
        if (insertError) {
          console.error("Supabase insert error (ensureSubscription):", insertError);
          toast({ title: "Subscription Failed", description: insertError.message, variant: "destructive" });
          return;
        }
        toast({ title: "Subscribed!", description: "We will notify you of any changes." });
      }
      performDataFetch(); // This will set isFetchingAll to false
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "An unexpected error occurred while managing your subscription.", variant: "destructive" });
      setIsFetchingAll(false); // Ensure isFetchingAll is reset on error if performDataFetch is not reached
    }
  };


  const handleSaveAndSubscribe = async () => {
    const validStoreUrls = getValidStoreUrls();
    if (validStoreUrls.length === 0) {
      toast({
        title: "No valid stores",
        description: "Please add and validate at least one Shopify store URL.",
        variant: "destructive"
      });
      return;
    }

    if (!hasSubscribedThisSession) {
      setShowEmailModal(true);
    } else {
      await ensureSubscriptionIsCurrentAndFetch();
    }
  };


  const handleEmailSubmit = async () => {
    if (!email.trim() || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    const currentValidUrls = getValidStoreUrls();

    if (currentValidUrls.length === 0) {
      toast({
        title: "No Valid Stores",
        description: "Please ensure there are valid and validated store URLs to subscribe to.",
        variant: "destructive",
      });
      return;
    }

    const workingToast = toast({ title: "Processing Subscription...", description: "Please wait." });

    try {
      const { data: existingSubscription, error: fetchSubError } = await supabase
        .from('subscriptions')
        .select('id, competitor_urls, is_active')
        .eq('email', email)
        .single();

      if (existingSubscription) {
        const existingUrls = existingSubscription.competitor_urls || [];
        const newUrlsToAdd = currentValidUrls.filter(url => !existingUrls.includes(url));

        if (newUrlsToAdd.length > 0 || !existingSubscription.is_active) { 
          const updatedUrls = [...new Set([...existingUrls, ...currentValidUrls])]; 
          const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ competitor_urls: updatedUrls, is_active: true })
            .eq('id', existingSubscription.id);

          if (updateError) throw updateError;
          workingToast.update({ id: workingToast.id, title: "Subscription Updated", description: "Your list of monitored stores has been updated." });
        } else {
          workingToast.update({ id: workingToast.id, title: "Already Subscribed", description: "You are already subscribed to updates for these stores." });
        }
      } else {
        if (fetchSubError && fetchSubError.code !== 'PGRST116') { 
          throw fetchSubError;
        }
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert([{ email, competitor_urls: currentValidUrls, is_active: true }]);
        if (insertError) throw insertError;
        workingToast.update({ id: workingToast.id, title: "Subscribed!", description: "We will notify you of any changes. Fetching initial data..." });
      }
      
      setShowEmailModal(false);
      setHasSubscribedThisSession(true);

      const fetchedData = await performDataFetch();
      
      if (fetchedData && fetchedData.length > 0) {
        const successfulFetches = fetchedData.filter(s => s.data && !s.error);
        if (successfulFetches.length > 0) {
          try {
            const { error: functionError } = await supabase.functions.invoke('send-store-data-email', {
              body: { email, storesData: successfulFetches.map(s => ({ url: s.url, data: s.data, id: s.id })) },
            });
            if (functionError) throw functionError;
            toast({ title: "Initial Data Sent", description: "The initial data for your subscribed stores has been sent to your email." });

            // Call periodic-store-check after successful initial email
            try {
              const { error: periodicFunctionError } = await supabase.functions.invoke('periodic-store-check', {
                body: { email, storeUrls: successfulFetches.map(s => s.url) }, 
              });
              if (periodicFunctionError) throw periodicFunctionError;
              toast({ title: "Monitoring Activated", description: "Periodic checks for store updates have been enabled." });
            } catch (periodicError: any) {
              console.error("Error invoking periodic-store-check function:", periodicError);
              toast({ title: "Monitoring Setup Failed", description: periodicError.message || "Could not enable periodic store checks.", variant: "destructive" });
            }

          } catch (e: any) {
            console.error("Error invoking send-store-data-email function:", e);
            toast({ title: "Email Error", description: e.message || "Could not send initial store data email.", variant: "destructive" });
          }
        } else {
          const firstError = fetchedData.find(s => s.error)?.error;
          toast({ title: "No Data Fetched", description: firstError || "Could not fetch initial data for the stores. Please check URLs or try again.", variant: "default" });
        }
      } else {
        toast({ title: "No Data to Send", description: "No data was fetched for the stores, so no initial email sent.", variant: "default" });
      }

    } catch (error: any) {
      console.error("Subscription/Fetch Error:", error);
      workingToast.update({ id: workingToast.id, title: "Operation Failed", description: error.message || "An error occurred. Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Add Competitor Stores</h2>
        <p className="text-sm text-gray-600 mb-4">Enter the Shopify store URLs of your competitors to track their product listings and prices. Get email notifications for any changes!</p>
        <div className="space-y-4">
          {stores.map((store) => (
            <div key={store.id} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Enter competitor's URL (e.g. store-name.com)"
                  value={store.url}
                  onChange={(e) => updateStoreUrl(store.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      validateUrl(store.id);
                    }
                  }}
                  className={
                    store.isValid === true ? "border-green-500" : 
                    store.isValid === false ? "border-red-500" : 
                    ""
                  }
                  disabled={store.isLoading || isFetchingAll}
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
                  disabled={!store.url.trim() || store.isLoading || isFetchingAll}
                  title="Validate URL"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => removeStore(store.id)}
                  disabled={store.isLoading || isFetchingAll}
                  title="Remove URL"
                >
                  <span className="sr-only">Remove</span>
                  &times;
                </Button>
              </div>
            </div>
          ))}
          
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={addStore}
              disabled={stores.length >= 5 || isFetchingAll}
              className="flex items-center gap-1 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Add another URL
            </Button>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                onClick={handlePreviewData}
                disabled={!stores.some(store => store.isValid) || isFetchingAll}
                className="flex items-center gap-2 flex-1 sm:flex-initial"
                variant="outline"
              >
                <Eye className="h-4 w-4" />
                {isFetchingAll && stores.some(s => s.isLoading && s.isValid) ? "Fetching..." : "Preview Data"}
              </Button>
              <Button
                onClick={handleSaveAndSubscribe}
                disabled={!stores.some(store => store.isValid) || isFetchingAll}
                className="flex items-center gap-2 flex-1 sm:flex-initial"
              >
                <Save className="h-4 w-4" />
                {isFetchingAll && hasSubscribedThisSession ? "Updating..." : (isFetchingAll ? "Processing..." : "Save & Get Updates")}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="competitor-data">Competitor Data</TabsTrigger>
          <TabsTrigger value="pricing-strategies" className="text-blue-600 font-semibold border-blue-600">
            Pricing Strategies ✨
          </TabsTrigger>
        </TabsList>
        <TabsContent value="competitor-data">
          <StoreDataDisplay stores={stores.filter(s => s.isValid && (s.data || s.error))} />
        </TabsContent>
        <TabsContent value="pricing-strategies">
          <Card>
            <CardHeader>
              <CardTitle>Pricing Strategy Suggestions</CardTitle>
              <CardDescription>
                Suggestions for your products (from 'ecosys' store) against each competitor.
                <Button onClick={fetchPricingSuggestions} disabled={isLoadingSuggestions || isFetchingAll} className="ml-4" size="sm">
                  {isLoadingSuggestions ? "Refreshing..." : "Refresh Suggestions"}
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSuggestions && <p>Loading suggestions...</p>}
              {!isLoadingSuggestions && pricingSuggestionsByCompetitor.length === 0 && (
                <p>No pricing suggestions available. Ensure 'ecosys' store data is present and competitor data is fetched and matched.</p>
              )}
              {!isLoadingSuggestions && pricingSuggestionsByCompetitor.length > 0 && (
                <Tabs value={activePricingTab} onValueChange={setActivePricingTab} className="w-full">
                  <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${pricingSuggestionsByCompetitor.length}, minmax(0, 1fr))` }}>
                    {pricingSuggestionsByCompetitor.map(compSuggestion => (
                      <TabsTrigger key={compSuggestion.competitor_store_identifier} value={compSuggestion.competitor_store_identifier}>
                        vs {compSuggestion.competitor_store_identifier}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {pricingSuggestionsByCompetitor.map(compSuggestion => (
                    <TabsContent key={compSuggestion.competitor_store_identifier} value={compSuggestion.competitor_store_identifier} className="mt-4">
                      {compSuggestion.suggestions_for_our_products.length === 0 && (
                        <p>No specific product matches or suggestions against {compSuggestion.competitor_store_identifier}.</p>
                      )}
                      {compSuggestion.suggestions_for_our_products.map((suggestion, index) => (
                        <Card key={index} className="p-4 mb-4">
                          <h3 className="font-semibold text-lg">{suggestion.title} - <span className="font-normal text-md">{suggestion.variant_title}</span></h3>
                          <p>Your Current Price: ${suggestion.current_price.toFixed(2)}</p>
                          <div className="mt-2 space-y-1 text-sm">
                            <p><strong>Suggested Prices (vs {compSuggestion.competitor_store_identifier}):</strong></p>
                            <ul className="list-disc pl-5">
                              <li>Undercut Lower: ${suggestion.suggested_prices.undercut_lower.toFixed(2)}</li>
                              <li>Undercut Average: ${suggestion.suggested_prices.undercut_avg.toFixed(2)}</li>
                              <li>Match Lowest: ${suggestion.suggested_prices.lowest_price_match.toFixed(2)}</li>
                              <li>Slight Premium: ${suggestion.suggested_prices.slight_premium.toFixed(2)}</li>
                              <li>Premium: ${suggestion.suggested_prices.premium.toFixed(2)}</li>
                            </ul>
                          </div>
                          {suggestion.matched_competitor_variants_from_this_competitor.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium">Based on {suggestion.matched_competitor_variants_from_this_competitor.length} matched variant(s) from {compSuggestion.competitor_store_identifier}:</p>
                              <ul className="list-disc pl-5 text-xs">
                                {suggestion.matched_competitor_variants_from_this_competitor.slice(0,3).map((compVar, cIdx) => (
                                  <li key={cIdx}>
                                    <strong>{compVar.competitor_product_title}</strong>
                                    {compVar.competitor_variant_title && ` (${compVar.competitor_variant_title})`}
                                    {' '}- ${compVar.price.toFixed(2)}
                                  </li>
                                ))}
                                {suggestion.matched_competitor_variants_from_this_competitor.length > 3 && <li>...and {suggestion.matched_competitor_variants_from_this_competitor.length - 3} more.</li>}
                              </ul>
                            </div>
                          )}
                        </Card>
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showEmailModal} onOpenChange={(isOpen) => {
        setShowEmailModal(isOpen);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Get Notified of Changes</DialogTitle>
            <DialogDescription>
              Enter your email to receive updates when competitor products or prices change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="you@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailModal(false)}>Cancel</Button>
            <Button onClick={handleEmailSubmit}>Subscribe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompetitorTracker;