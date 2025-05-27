import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface StoreFetchResult {
  url: string;
  data?: any; // Product data
  error?: string;
}

// Simplified Shopify data fetcher for the Edge Function
// In a real app, make this robust and share/align with frontend's shopifyUtils.ts
async function fetchShopifyStoreData(storeUrl: string): Promise<StoreFetchResult> {
  let fullUrl = storeUrl;
  if (!/^https?:\/\//i.test(fullUrl)) {
    fullUrl = `https://${fullUrl}`;
  }
  if (fullUrl.endsWith('/')) {
    fullUrl = fullUrl.slice(0, -1);
  }
  const productsUrl = `${fullUrl}/products.json?limit=10&published_status=published`; // Fetch first 10 published products

  try {
    // console.log(`Periodic check: Fetching data for: ${productsUrl}`);
    const response = await fetch(productsUrl, { headers: { 'User-Agent': 'CompetitorWatchdogCron/1.0' } });
    
    if (!response.ok) {
      // Attempt with 'www' if it's a root domain and failed
      const urlObj = new URL(fullUrl);
      if (!urlObj.hostname.startsWith('www.') && urlObj.hostname.split('.').length === 2) {
        const wwwHostname = `www.${urlObj.hostname}`;
        const wwwProductsUrl = `https://${wwwHostname}${urlObj.pathname === '/' ? '' : urlObj.pathname}/products.json?limit=10&published_status=published`;
        // console.log(`Periodic check: Retrying with www: ${wwwProductsUrl}`);
        const wwwResponse = await fetch(wwwProductsUrl, { headers: { 'User-Agent': 'CompetitorWatchdogCron/1.0' } });
        if (wwwResponse.ok) {
          const data = await wwwResponse.json();
          // console.log(`Periodic check: Successfully fetched data for ${storeUrl} (via www)`);
          return { url: storeUrl, data };
        }
        // If www also fails, report original error
      }
      throw new Error(`HTTP error ${response.status} for ${productsUrl}`);
    }
    const data = await response.json();
    // console.log(`Periodic check: Successfully fetched data for ${storeUrl}`);
    return { url: storeUrl, data };
  } catch (error: any) {
    console.error(`Periodic check: Error fetching data for ${storeUrl}: ${error.message}`);
    return { url: storeUrl, error: error.message };
  }
}

// Helper function for actual email sending using Resend
async function sendEmailWithResend(to: string, subject: string, body: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    // Log a warning but don't throw an error to allow other emails to be processed if one is misconfigured.
    // The function calling this should handle the error appropriately if it needs to stop execution.
    console.warn(`RESEND_API_KEY not set. Cannot send email to ${to}.`);
    // Optionally, re-throw if you want to halt operations or handle this more strictly upstream
    throw new Error("RESEND_API_KEY is not set. Cannot send email.");
  }

  // Replace newline characters with <br> tags for HTML email compatibility
  const htmlBody = body.replace(/\\n/g, "<br>");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Competitor Watchdog <noreply@cohesyve.com>", // IMPORTANT: Replace with your verified Resend domain
        to: [to],
        subject: subject,
        html: htmlBody,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Failed to send email to ${to}: ${response.status}`, errorData);
      // Throw an error to be caught by the calling function, allowing for specific error handling per email if needed
      throw new Error(`Email sending failed for ${to}: ${errorData.message || response.statusText}`);
    }
    console.log(`Email sent successfully via Resend to: ${to}`);
  } catch (error: any) {
    console.error(`Error sending email to ${to} via Resend: ${error.message}`);
    // Re-throw the error so it can be handled by the main processing loop
    // This ensures that a failure to send one email doesn't silently pass
    throw error; 
  }
}

console.log("periodic-store-check function initializing.");

serve(async (req: Request) => {
  // This function is intended to be triggered by a cron job.
  // Supabase cron invokes functions via a POST request.
  // Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Edge Function environment variables.

  console.log("Periodic store check function invoked.");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    }

    const supabaseClient: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: subscriptions, error: subsError } = await supabaseClient
      .from("subscriptions")
      .select("email, competitor_urls")
      .eq("is_active", true);

    if (subsError) {
      console.error("Error fetching subscriptions:", subsError);
      throw subsError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No active subscriptions found.");
      return new Response(JSON.stringify({ message: "No active subscriptions." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${subscriptions.length} active subscriptions to process.`);

    for (const sub of subscriptions) {
      const { email, competitor_urls } = sub;
      if (!email || !competitor_urls || competitor_urls.length === 0) {
        console.log(`Skipping subscription for '${email || 'unknown email'}' due to missing email or URLs.`);
        continue;
      }

      console.log(`Processing subscription for ${email}. URLs: ${competitor_urls.join(', ')}`);
      const emailStoresData: StoreFetchResult[] = [];

      for (const url of competitor_urls) {
        const result = await fetchShopifyStoreData(url);
        emailStoresData.push(result);
        // TODO: Implement change detection here if needed.
        // e.g., fetch previous snapshot, compare, and only include if changed.
      }

      if (emailStoresData.length > 0) {
        // Simulate sending email with the (potentially changed) data
        // console.log(`--- Simulating Periodic Email to ${email} ---`);
        const emailSubject = "Your Periodic Shopify Store Update";
        let emailBody = `Hello,\\\\n\\\\nHere is your periodic update for your monitored Shopify stores:\\\\n\\\\n`;
        
        emailStoresData.forEach(store => {
          emailBody += `Store URL: ${store.url}\\\\n`;
          if (store.data && store.data.products && store.data.products.length > 0) {
            emailBody += `  Products (${store.data.products.length} found):\\\\n`;
            store.data.products.slice(0, 3).forEach((product: any) => { // Show first 3 products
              emailBody += `    - ${product.title} (Price: ${product.variants?.[0]?.price || 'N/A'})\\\\n`;
            });
            if (store.data.products.length > 3) {
              emailBody += `    ...and ${store.data.products.length - 3} more products.\\\\n`;
            }
          } else if (store.error) {
            emailBody += `  Error fetching data: ${store.error}\\\\n`;
          } else {
            emailBody += "  No product data found, or the store might be empty.\\\\n";
          }
          emailBody += "\\\\n";
        });
        emailBody += "You are receiving this as part of your Competitor Watchdog subscription.\\\\n";
        
        // console.log("Full Email Body for ${email}:\\\\n", emailBody); // Can be very verbose
        // console.log(`Preview of email body for ${email} (first 500 chars):\\\\n ${emailBody.substring(0,500).replace(/\\\\n/g, '\\\\n')}`);
        // console.log(`--- End Email Simulation for ${email} ---`);
        // TODO: Implement actual email sending logic here (e.g., using Resend, SendGrid, etc.)
        try {
          await sendEmailWithResend(email, emailSubject, emailBody);
          console.log(`Successfully dispatched periodic update email to ${email}.`);
        } catch (emailError: any) {
          console.error(`Failed to send periodic update email to ${email}: ${emailError.message}`);
          // Decide if you want to continue processing other subscriptions or halt.
          // For now, we log the error and continue.
        }
      } else {
        console.log(`No data to send for ${email} for this period.`);
      }
    }

    return new Response(JSON.stringify({ message: "Periodic check completed. Emails processed." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`Error in periodic-store-check function: ${error.message}`, error.stack);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
