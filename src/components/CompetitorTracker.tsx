import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, Eye, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import StoreDataDisplay from "@/components/StoreDataDisplay";
import { fetchStoreData, validateShopifyUrl } from "@/utils/shopifyUtils";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface CompetitorStore {
  id: string;
  url: string;
  isValid: boolean | null;
  isLoading: boolean;
  data: {
    products: any[];
    currency_code?: string | null; // Changed from currency_symbol
    // other store data fields
  } | null;
  error: string | null;
}

interface MatchedCompetitorVariantDetail {
  competitor_product_title: string;
  competitor_variant_title: string;
  price: number;
  competitor_currency_symbol: string;
}

interface OurProductSuggestion {
  title: string;
  variant_title: string;
  current_price: number;
  our_currency_symbol: string;
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
  const [ourStore, setOurStore] = useState<CompetitorStore>({
    id: "our-store",
    url: "",
    isValid: null,
    isLoading: false,
    data: null,
    error: null
  });
  const [competitorStores, setCompetitorStores] = useState<CompetitorStore[]>([{
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
  const [pricingSuggestionsByCompetitor, setPricingSuggestionsByCompetitor] = useState<SuggestionsByCompetitor[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [activePricingTab, setActivePricingTab] = useState<string>("");
  const [showTabs, setShowTabs] = useState(false); // Added state for Tabs visibility

  const getCurrencySymbol = (currencyCode?: string | null): string => {
    if (!currencyCode) return "$"; // Default symbol
    switch (currencyCode?.toUpperCase()) {
      case "USD": return "$";
      case "EUR": return "€";
      case "GBP": return "£";
      case "INR": return "₹";
      // Add more currency codes as needed
      default: return currencyCode || "$"; // Fallback to code or default if symbol not found
    }
  };

  const formatCurrency = (price: number, currencySymbol: string) => {
    return `${currencySymbol}${price.toFixed(2)}`;
  };

  const getValidCompetitorStoreUrls = () => competitorStores.filter(store => store.isValid && store.url).map(store => store.url);

  const addCompetitorStoreInput = () => {
    if (competitorStores.length >= 5) {
      toast({
        title: "Maximum limit reached",
        description: "You can monitor up to 5 competitor stores.",
        variant: "destructive"
      });
      return;
    }
    setCompetitorStores([...competitorStores, {
      id: crypto.randomUUID(),
      url: "",
      isValid: null,
      isLoading: false,
      data: null,
      error: null
    }]);
  };

  const removeCompetitorStoreInput = (id: string) => {
    if (competitorStores.length === 1) {
      setCompetitorStores([{
        id: crypto.randomUUID(),
        url: "",
        isValid: null,
        isLoading: false,
        data: null,
        error: null
      }]);
    } else {
      setCompetitorStores(competitorStores.filter(store => store.id !== id));
    }
  };

  const updateOurStoreUrl = (url: string) => {
    setOurStore(prev => ({ ...prev, url, isValid: null, data: null, error: null }));
  };

  const updateCompetitorStoreUrl = (id: string, url: string) => {
    setCompetitorStores(prevStores => prevStores.map(store =>
      store.id === id ? { ...store, url, isValid: null, data: null, error: null } : store
    ));
  };

  const validateStore = async (storeId: string, isOurStore: boolean) => {
    const storeToValidate = isOurStore ? ourStore : competitorStores.find(s => s.id === storeId);

    if (!storeToValidate || !storeToValidate.url.trim()) {
      toast({ title: "Invalid URL", description: "Please enter a valid URL", variant: "destructive" });
      return;
    }

    const updateLoadingState = (isLoading: boolean, isValid?: boolean | null, errorMsg?: string | null) => {
      if (isOurStore) {
        setOurStore(prev => ({ ...prev, isLoading, isValid: isValid === undefined ? prev.isValid : isValid, error: errorMsg === undefined ? prev.error : errorMsg }));
      } else {
        setCompetitorStores(prevStores => prevStores.map(s =>
          s.id === storeId ? { ...s, isLoading, isValid: isValid === undefined ? s.isValid : isValid, error: errorMsg === undefined ? s.error : errorMsg } : s
        ));
      }
    };

    updateLoadingState(true, null, null);

    try {
      const isValid = await validateShopifyUrl(storeToValidate.url);
      updateLoadingState(false, isValid, isValid ? null : "This doesn't appear to be a Shopify store.");
      toast({
        title: isValid ? "Valid Shopify Store" : "Not a Shopify Store",
        description: isValid ? "This URL is a valid Shopify store." : "This URL doesn't appear to be a Shopify store.",
        variant: isValid ? "default" : "destructive"
      });
    } catch (error) {
      updateLoadingState(false, false, "Error validating URL. Please check and try again.");
      toast({ title: "Error", description: "Could not validate the URL.", variant: "destructive" });
    }
  };
  
  const fetchPricingSuggestions = async () => {
    if (!ourStore || !ourStore.isValid || !ourStore.data) {
      toast({
        title: "Your Store Data Missing",
        description: "Could not find data for your store. Please ensure it's validated and data is fetched.",
        variant: "destructive",
      });
      setPricingSuggestionsByCompetitor([]);
      return;
    }

    const validCompetitorsWithData = competitorStores.filter(store => store.isValid && store.data);

    if (validCompetitorsWithData.length === 0) {
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
      const our_data_products = Array.isArray(ourStore.data.products) ? ourStore.data.products : [];
      const our_data_payload = { 
        products: our_data_products, 
        currency_symbol: getCurrencySymbol(ourStore.data?.currency_code) // MODIFIED: Use getCurrencySymbol
      };
      
      const competitor_stores_data_payload = validCompetitorsWithData.map(store => {
        let identifier = "unknown-competitor";
        try {
          const fullUrl = store.url.startsWith("http://") || store.url.startsWith("https://") ? store.url : `https://${store.url}`;
          identifier = new URL(fullUrl).hostname;
        } catch (e) {
          identifier = store.url; 
        }
        const competitor_products = Array.isArray(store.data?.products) ? store.data.products : [];
        return {
          store_identifier: identifier,
          products: competitor_products,
          currency_symbol: getCurrencySymbol(store.data?.currency_code) // MODIFIED: Use getCurrencySymbol
        };
      });
      
      const { data: suggestionsFromApi, error } = await supabase.functions.invoke('pricing-suggestions', {
        body: { our_data: our_data_payload, competitor_stores_data: competitor_stores_data_payload },
      });

      if (error) throw error;

      if (suggestionsFromApi && Array.isArray(suggestionsFromApi)) {
        const enrichedSuggestions = suggestionsFromApi.map(compSuggestion => {
          const ourStoreDisplaySymbol = getCurrencySymbol(ourStore.data?.currency_code); // ADDED: for fallback

          // Find the original competitor store to get its currency code for fallback
          const competitorStoreBeingProcessed = validCompetitorsWithData.find(s => {
            let id = "unknown";
            try {
              const fullUrl = s.url.startsWith("http://") || s.url.startsWith("https://") ? s.url : `https://${s.url}`;
              id = new URL(fullUrl).hostname;
            } catch (e) { id = s.url; }
            return id === compSuggestion.competitor_store_identifier;
          });
          const competitorDisplaySymbol = getCurrencySymbol(competitorStoreBeingProcessed?.data?.currency_code); // ADDED: for fallback

          return {
            ...compSuggestion,
            suggestions_for_our_products: compSuggestion.suggestions_for_our_products.map((prodSuggestion: any) => ({
              ...prodSuggestion,
              our_currency_symbol: prodSuggestion.our_currency_symbol || ourStoreDisplaySymbol, // MODIFIED: Fallback to ourStoreDisplaySymbol
              matched_competitor_variants_from_this_competitor: prodSuggestion.matched_competitor_variants_from_this_competitor.map((variantDetail: any) => ({
                ...variantDetail,
                competitor_currency_symbol: variantDetail.competitor_currency_symbol || competitorDisplaySymbol, // MODIFIED: Fallback to competitorDisplaySymbol
              })),
            })),
          };
        });

        setPricingSuggestionsByCompetitor(enrichedSuggestions);
        if (enrichedSuggestions.length > 0 && enrichedSuggestions[0].competitor_store_identifier) {
          setActivePricingTab(enrichedSuggestions[0].competitor_store_identifier);
        }
        toast({ title: "Pricing Strategies Updated", description: "Suggestions based on current data." });
      } else {
        setPricingSuggestionsByCompetitor([]);
        toast({ title: "No Suggestions", description: "Could not generate pricing suggestions or format is incorrect.", variant: "default" });
      }
    } catch (error: any) {
      console.error("Error fetching pricing suggestions:", error);
      toast({
        title: "Error Fetching Suggestions",
        description: `Failed to communicate with the pricing service: ${error.message}.`,
        variant: "destructive",
      });
      setPricingSuggestionsByCompetitor([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    const hasAnyData = (ourStore.isValid && ourStore.data) || competitorStores.some(s => s.isValid && s.data);
    if (activeTab === "pricing-strategies" && hasAnyData) {
      fetchPricingSuggestions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ourStore.data, JSON.stringify(competitorStores.map(s => s.data))]);


  const performSingleStoreDataFetch = async (storeToFetch: CompetitorStore, isOurStore: boolean): Promise<CompetitorStore> => {
    const updateStoreState = (updateFn: (prev: CompetitorStore) => CompetitorStore) => {
      if (isOurStore) setOurStore(updateFn);
      else setCompetitorStores(prev => prev.map(s => s.id === storeToFetch.id ? updateFn(s) : s));
    };

    updateStoreState(s => ({ ...s, isLoading: true, data: null, error: null }));

    try {
      // fetchStoreData is expected to return: { products: [], currency_symbol: "USD", ...otherData }
      const fetchedData = await fetchStoreData(storeToFetch.url); 
      const storeWithData = { ...storeToFetch, isLoading: false, data: fetchedData, error: null };
      updateStoreState(() => storeWithData);
      return storeWithData;
    } catch (fetchError: any) {
      const errorMessage = fetchError?.message || "Failed to fetch store data.";
      const errorStore = { ...storeToFetch, isLoading: false, data: null, error: errorMessage };
      updateStoreState(() => errorStore);
      return errorStore;
    }
  };

  const performAllDataFetch = async (): Promise<CompetitorStore[]> => {
    setIsFetchingAll(true);
    const results: CompetitorStore[] = [];
    let fetchedOurStoreData: CompetitorStore | null = null;

    if (ourStore.isValid && ourStore.url) {
      fetchedOurStoreData = await performSingleStoreDataFetch(ourStore, true);
      if (fetchedOurStoreData) results.push(fetchedOurStoreData);
    }

    const validCompetitors = competitorStores.filter(store => store.isValid && store.url);
    for (const competitor of validCompetitors) {
      const fetchedCompetitor = await performSingleStoreDataFetch(competitor, false);
      results.push(fetchedCompetitor);
    }
    
    setIsFetchingAll(false);
    if (activeTab === "pricing-strategies" && results.some(r => r.data)) {
       fetchPricingSuggestions();
    }
    return results;
  };

  const handlePreviewData = async () => {
    const hasValidOurStore = ourStore.isValid && ourStore.url;
    const hasValidCompetitors = competitorStores.some(store => store.isValid && store.url);

    if (!hasValidOurStore && !hasValidCompetitors) {
      toast({
        title: "No valid stores",
        description: "Please add and validate your store URL or at least one competitor Shopify store URL to preview data.",
        variant: "destructive"
      });
      return;
    }
    await performAllDataFetch();
  };
  
  const ensureSubscriptionIsCurrentAndFetch = async () => {
    // Ensure email is available if we are to interact with subscriptions
    if (!email && hasSubscribedThisSession) { // Check if email state is actually set
        toast({
            title: "Email Not Found",
            description: "Your email is needed to update subscriptions. Please try subscribing again.",
            variant: "destructive",
        });
        // Optionally, reset hasSubscribedThisSession or prompt for email again
        // For now, we prevent proceeding without an email if subscription interaction is expected.
        // setShowEmailModal(true); // Could reopen modal
        return;
    }


    const currentValidCompetitorUrls = getValidCompetitorStoreUrls();

    // For subscription, competitor URLs are usually required.
    // If only fetching data for our store, this check might be bypassed if hasSubscribedThisSession is false.
    // However, ensureSubscriptionIsCurrentAndFetch implies subscription interaction.
    if (currentValidCompetitorUrls.length === 0 && hasSubscribedThisSession) { // Only enforce if trying to update a subscription
      toast({
        title: "No Valid Competitor Stores",
        description: "Please ensure there are valid competitor store URLs to update your subscription.",
        variant: "destructive",
      });
      // return; // Commented out to allow fetching our store data even if no competitors for an existing "session"
    }
    
    if (!ourStore.isValid || !ourStore.url) {
      toast({
        title: "Your Store URL Missing",
        description: "Please add and validate your store URL before fetching data or updating subscription.",
        variant: "destructive"
      });
      return;
    }

    setIsFetchingAll(true);
    try {
      // If user has an email session, try to update/verify subscription
      if (hasSubscribedThisSession && email) {
        const { data: existingSubscription, error: fetchSubError } = await supabase
          .from('subscriptions')
          .select('id, competitor_urls, is_active, our_store_url')
          .eq('email', email)
          .single();

        if (existingSubscription) {
          const existingUrls = existingSubscription.competitor_urls || [];
          const urlsHaveChanged = !(currentValidCompetitorUrls.length === existingUrls.length && currentValidCompetitorUrls.every(url => existingUrls.includes(url)));
          const ourStoreUrlHasChanged = existingSubscription.our_store_url !== ourStore.url;

          if (urlsHaveChanged || !existingSubscription.is_active || ourStoreUrlHasChanged) {
            const { error: updateError } = await supabase
              .from('subscriptions')
              .update({ competitor_urls: currentValidCompetitorUrls, is_active: true, our_store_url: ourStore.url })
              .eq('id', existingSubscription.id);

            if (updateError) throw updateError;
            toast({ title: "Subscription Updated", description: "Your list of monitored competitor stores and your store URL has been updated." });
          } else {
            // toast({ title: "Stores Already Up-to-Date", description: "Your monitored stores are already up-to-date." });
            // No need for a toast if just fetching data and subscription is current
          }
        } else {
          // No existing subscription found for this email, but hasSubscribedThisSession is true.
          // This could mean they entered email, but initial subscription failed or they are new.
          // Let's attempt to insert a new subscription.
          if (fetchSubError && fetchSubError.code !== 'PGRST116') throw fetchSubError; // PGRST116: 0 rows
          // Only insert if there are competitor URLs to subscribe to
          if (currentValidCompetitorUrls.length > 0) {
            const { error: insertError } = await supabase
              .from('subscriptions')
              .insert([{ email, competitor_urls: currentValidCompetitorUrls, is_active: true, our_store_url: ourStore.url }]);
            if (insertError) throw insertError;
            toast({ title: "Subscribed!", description: "We will notify you of any changes to competitor stores." });
          }
        }
      }
      // Always fetch data regardless of subscription status if this function is called
      await performAllDataFetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
        setIsFetchingAll(false);
    }
  };

  const handleGetDataClick = async () => {
    if (!ourStore.isValid || !ourStore.url) {
       toast({
        title: "Your Store URL Missing",
        description: "Please add and validate your store URL first.",
        variant: "destructive"
      });
      return;
    }

    if (!hasSubscribedThisSession) {
      // If no competitor URLs are present, the subscription part of email submission might be skipped,
      // but we still need email for potential future features or if they add competitors later.
      // The `handleEmailSubmit` function itself has checks for competitor URLs before actual subscription.
      setShowEmailModal(true);
    } else {
      // Email already provided (hasSubscribedThisSession is true),
      // so proceed to ensure subscription is current and fetch data.
      await ensureSubscriptionIsCurrentAndFetch();
      setShowTabs(true); // Show tabs after successful data fetch
    }
  };

  const handleEmailSubmit = async () => {
    if (!email.trim() || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.[a-zA-Z]{2,})+$/.test(email)) {
      toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    const currentValidCompetitorUrls = getValidCompetitorStoreUrls();
     if (!ourStore.isValid || !ourStore.url) {
      toast({ title: "Your Store URL Missing", description: "Please add and validate your store URL first.", variant: "destructive" });
      return;
    }
    if (currentValidCompetitorUrls.length === 0) {
      toast({ title: "No Valid Competitor Stores", description: "Please ensure there are valid competitor store URLs to subscribe.", variant: "destructive" });
      return;
    }

    const workingToast = toast({ title: "Processing Subscription...", description: "Please wait." });
    setIsFetchingAll(true);

    try {
      const { data: existingSubscription, error: fetchSubError } = await supabase
        .from('subscriptions')
        .select('id, competitor_urls, is_active, our_store_url') // Added our_store_url
        .eq('email', email)
        .single();

      if (existingSubscription) {
        const existingUrls = existingSubscription.competitor_urls || [];
        const newUrlsToAdd = currentValidCompetitorUrls.filter(url => !existingUrls.includes(url));
        const ourStoreUrlHasChanged = existingSubscription.our_store_url !== ourStore.url;

        if (newUrlsToAdd.length > 0 || !existingSubscription.is_active || ourStoreUrlHasChanged) {
          const updatedUrls = [...new Set([...existingUrls, ...currentValidCompetitorUrls])];
          const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ competitor_urls: updatedUrls, is_active: true, our_store_url: ourStore.url }) // Added our_store_url
            .eq('id', existingSubscription.id);
          if (updateError) throw updateError;
          workingToast.update({ id: workingToast.id, title: "Subscription Updated", description: "Monitored stores and your store URL updated. Fetching data..." });
        } else {
          workingToast.update({ id: workingToast.id, title: "Already Subscribed", description: "Already subscribed for these stores. Fetching data..." });
        }
      } else {
        if (fetchSubError && fetchSubError.code !== 'PGRST116') throw fetchSubError; // No rows found
        // Only insert subscription if there are competitor URLs
        if (currentValidCompetitorUrls.length > 0) {
            const { error: insertError } = await supabase
            .from('subscriptions')
            .insert([{ email, competitor_urls: currentValidCompetitorUrls, is_active: true, our_store_url: ourStore.url }]);
            if (insertError) throw insertError;
            workingToast.update({ id: workingToast.id, title: "Subscribed!", description: "Fetching initial data..." });
        } else {
            // If no competitor URLs, don't create a subscription record yet, but proceed with fetching data.
            workingToast.update({ id: workingToast.id, title: "Email Saved", description: "Fetching initial data for your store..." });
        }
      }
      
      setShowEmailModal(false);
      setHasSubscribedThisSession(true); // Added to reflect email submission

      // Removed email sending and periodic check function invocations
      // const fetchedDataResults = await performAllDataFetch(); 
      
      // const ourStoreDataForEmail = fetchedDataResults.find(s => s.id === "our-store" && s.data && !s.error);
      // const competitorStoresDataForEmail = fetchedDataResults.filter(s => s.id !== "our-store" && s.data && !s.error);
      
      // const storesDataForEmailPayload = [];
      // if (ourStoreDataForEmail) storesDataForEmailPayload.push({ url: ourStoreDataForEmail.url, data: ourStoreDataForEmail.data, id: ourStoreDataForEmail.id });
      // competitorStoresDataForEmail.forEach(s => storesDataForEmailPayload.push({ url: s.url, data: s.data, id: s.id }));


      // if (storesDataForEmailPayload.length > 0) {
      //   try {
      //     const { error: functionError } = await supabase.functions.invoke('send-store-data-email', {
      //       body: { email, storesData: storesDataForEmailPayload },
      //     });
      //     if (functionError) throw functionError;
      //     toast({ title: "Initial Data Sent", description: "Initial data for your store and competitors sent to your email." });

      //     const competitorUrlsForPeriodicCheck = competitorStoresDataForEmail.map(s => s.url);
      //     if (competitorUrlsForPeriodicCheck.length > 0) {
      //       try {
      //         const { error: periodicFunctionError } = await supabase.functions.invoke('periodic-store-check', {
      //           body: { email, storeUrls: competitorUrlsForPeriodicCheck, ourStoreUrl: ourStoreDataForEmail?.url },
      //         });
      //         if (periodicFunctionError) throw periodicFunctionError;
      //         toast({ title: "Monitoring Activated", description: "Periodic checks for competitor store updates enabled." });
      //       } catch (periodicError: any) {
      //         console.error("Error invoking periodic-store-check function:", periodicError);
      //         toast({ title: "Monitoring Setup Failed", description: periodicError.message || "Could not enable periodic store checks.", variant: "destructive" });
      //       }
      //     }
      //   } catch (e: any) {
      //     console.error("Error invoking send-store-data-email function:", e);
      //     toast({ title: "Email Error", description: e.message || "Could not send initial store data email.", variant: "destructive" });
      //   }
      // } else {
      //   const firstError = fetchedDataResults.find(s => s.error)?.error;
      //   toast({ title: "No Data Fetched for Email", description: firstError || "Could not fetch initial data for email. Check URLs.", variant: "default" });
      // }
      // Still fetch data after subscription handling
      await performAllDataFetch();
      setShowTabs(true); // Show tabs after successful data fetch

    } catch (error: any) {
      console.error("Subscription/Fetch Error:", error);
      workingToast.update({ id: workingToast.id, title: "Operation Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
        setIsFetchingAll(false);
    }
  };
  
  const allDisplayStores = () => {
    const storesForDisplay: CompetitorStore[] = [];
    if (ourStore && (ourStore.data || ourStore.error || ourStore.url)) storesForDisplay.push(ourStore);
    competitorStores.forEach(cs => {
      if (cs.url || cs.data || cs.error) storesForDisplay.push(cs);
    });
    return storesForDisplay.filter(s => s.id === 'our-store' || s.url.trim() !== '' || s.data || s.error);
  };


  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-2">Your Shopify Store</h2>
        <p className="text-sm text-gray-600 mb-4">Enter the URL of your own Shopify store. This will be used as the baseline for pricing strategies.</p>
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Enter your store URL (e.g., your-store.myshopify.com or your-domain.com)"
              value={ourStore.url}
              onChange={(e) => updateOurStoreUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') validateStore(ourStore.id, true); }}
              className={ourStore.isValid === true ? "border-green-500" : ourStore.isValid === false ? "border-red-500" : ""}
              disabled={ourStore.isLoading || isFetchingAll}
            />
            {ourStore.error && <p className="text-xs text-red-500 mt-1">{ourStore.error}</p>}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => validateStore(ourStore.id, true)}
            disabled={!ourStore.url.trim() || ourStore.isLoading || isFetchingAll}
            title="Validate Your Store URL"
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>

        <h2 className="text-xl font-semibold mb-2">Competitor Stores</h2>
        <p className="text-sm text-gray-600 mb-4">Enter the Shopify store URLs of your competitors (up to 5) to track their products and prices.</p>
        <div className="space-y-4">
          {competitorStores.map((store) => (
            <div key={store.id} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Enter competitor's URL (e.g. store-name.com)"
                  value={store.url}
                  onChange={(e) => updateCompetitorStoreUrl(store.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') validateStore(store.id, false);}}
                  className={store.isValid === true ? "border-green-500" : store.isValid === false ? "border-red-500" : ""}
                  disabled={store.isLoading || isFetchingAll}
                />
                {store.error && <p className="text-xs text-red-500 mt-1">{store.error}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => validateStore(store.id, false)}
                  disabled={!store.url.trim() || store.isLoading || isFetchingAll}
                  title="Validate Competitor URL"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removeCompetitorStoreInput(store.id)}
                  disabled={store.isLoading || isFetchingAll || (competitorStores.length === 1 && !competitorStores[0].url.trim())}
                  title="Remove Competitor URL"
                >
                  <span className="sr-only">Remove</span>
                  &times;
                </Button>
              </div>
            </div>
          ))}
          
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={addCompetitorStoreInput}
              disabled={competitorStores.length >= 5 || isFetchingAll}
              className="flex items-center gap-1 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Add Competitor URL
            </Button>
            
            <div className="flex gap-2 w-full sm:w-auto">
              {/* Preview Data button removed */}
              <Button
                onClick={handleGetDataClick}
                disabled={!ourStore.isValid || !ourStore.url.trim() || isFetchingAll}
                className="flex items-center gap-2 flex-1 sm:flex-initial"
              >
                <Eye className="h-4 w-4" /> {/* Changed Icon to Eye, or could be Save, or a new one */}
                {isFetchingAll ? "Fetching..." : "Get Data"}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {showTabs && (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-white">
          <TabsTrigger value="competitor-data" data-state={activeTab === "competitor-data" ? "active" : "inactive"} className="data-[state=active]:bg-[hsl(229,58.8%,56.7%)] data-[state=active]:text-white">Competitor Data</TabsTrigger>
          <TabsTrigger value="pricing-strategies" data-state={activeTab === "pricing-strategies" ? "active" : "inactive"} className="data-[state=active]:bg-[hsl(229,58.8%,56.7%)] data-[state=active]:text-white">
          Pricing Strategies ✨
          </TabsTrigger>
        </TabsList>
        <TabsContent value="competitor-data">
          <StoreDataDisplay stores={allDisplayStores()} />
        </TabsContent>
        <TabsContent value="pricing-strategies">
          <Card>
            <CardHeader>
              <CardTitle>Pricing Strategy Suggestions</CardTitle>
              <CardDescription className="flex justify-between items-center">
                <span>
                  Suggestions for your products (from your store) against each competitor.
                </span>
                <Button onClick={fetchPricingSuggestions} disabled={isLoadingSuggestions || isFetchingAll || !ourStore.isValid || !ourStore.data} size="sm">
                  {isLoadingSuggestions ? "Refreshing..." : "Refresh Suggestions"}
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSuggestions && <div className="text-center py-4">Loading suggestions...</div>}
              {!isLoadingSuggestions && pricingSuggestionsByCompetitor.length === 0 && (
                <div className="text-center py-4">No pricing suggestions available. Ensure your store data is present, and competitor data is fetched and matched.</div>
              )}
              {!isLoadingSuggestions && pricingSuggestionsByCompetitor.length > 0 && (
                <Tabs value={activePricingTab} onValueChange={setActivePricingTab} className="w-full" orientation="vertical">
                  <TabsList className={`grid grid-cols-${pricingSuggestionsByCompetitor.length} h-auto mb-4 w-full`}>
                    {pricingSuggestionsByCompetitor.map(compSuggestion => (
                      <TabsTrigger key={compSuggestion.competitor_store_identifier} value={compSuggestion.competitor_store_identifier} className="justify-center w-full">
                        vs {compSuggestion.competitor_store_identifier}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {pricingSuggestionsByCompetitor.map(compSuggestion => (
                    <TabsContent key={compSuggestion.competitor_store_identifier} value={compSuggestion.competitor_store_identifier} className="mt-0 pl-4">
                      {compSuggestion.suggestions_for_our_products.length === 0 && (
                        <p className="py-4">No specific product matches or suggestions against {compSuggestion.competitor_store_identifier}.</p>
                      )}
                      {compSuggestion.suggestions_for_our_products.map((suggestion, index) => (
                        <Card key={index} className="p-4 mb-4 shadow-md">
                          <h3 className="font-semibold text-lg">{suggestion.title} - <span className="font-normal text-md">{suggestion.variant_title}</span></h3>
                          <p>Your Current Price: {formatCurrency(suggestion.current_price, suggestion.our_currency_symbol)}</p>
                          <div className="mt-2 space-y-1 text-sm">
                            <p><strong>Suggested Prices (vs {compSuggestion.competitor_store_identifier}):</strong></p>
                            <ul className="list-disc pl-5">
                              <li>Undercut Lower: {formatCurrency(suggestion.suggested_prices.undercut_lower, suggestion.our_currency_symbol)}</li>
                              <li>Undercut Average: {formatCurrency(suggestion.suggested_prices.undercut_avg, suggestion.our_currency_symbol)}</li>
                              <li>Match Lowest: {formatCurrency(suggestion.suggested_prices.lowest_price_match, suggestion.our_currency_symbol)}</li>
                              <li>Slight Premium: {formatCurrency(suggestion.suggested_prices.slight_premium, suggestion.our_currency_symbol)}</li>
                              <li>Premium: {formatCurrency(suggestion.suggested_prices.premium, suggestion.our_currency_symbol)}</li>
                            </ul>
                          </div>
                          {suggestion.matched_competitor_variants_from_this_competitor.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs font-medium mb-1">Based on {suggestion.matched_competitor_variants_from_this_competitor.length} matched variant(s) from {compSuggestion.competitor_store_identifier}:</p>
                              <ul className="list-disc pl-5 text-xs space-y-1">
                                {suggestion.matched_competitor_variants_from_this_competitor.slice(0,3).map((compVar, cIdx) => (
                                  <li key={cIdx}>
                                    <strong>{compVar.competitor_product_title}</strong>
                                    {compVar.competitor_variant_title && ` (${compVar.competitor_variant_title})`}
                                    {' '}- {formatCurrency(compVar.price, compVar.competitor_currency_symbol)}
                                  </li>
                                ))}
                                {suggestion.matched_competitor_variants_from_this_competitor.length > 3 && <li className="text-gray-500">...and {suggestion.matched_competitor_variants_from_this_competitor.length - 3} more.</li>}
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
      )}

      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
            <DialogTitle className="mb-2">Thanks for using Shopify Watch</DialogTitle>
            <DialogDescription>
              Enter your email to proceed further and we'll continue sharing data-driven strategies to help grow your e-commerce business.
            </DialogDescription>
            </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-right">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailModal(false)}>Cancel</Button>
            <Button onClick={handleEmailSubmit} disabled={isFetchingAll}>
                {isFetchingAll ? "Processing..." : "Submit & Fetch Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompetitorTracker;