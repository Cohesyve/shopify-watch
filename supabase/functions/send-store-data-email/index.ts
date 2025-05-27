import { serve } from "https://deno.land/std@0.177.0/http/server.ts"; // Using a slightly more recent std version

interface StoreInfo {
  id: string;
  url: string;
  data: any; // Contains product info, etc.
}

interface RequestPayload {
  email: string;
  storesData: StoreInfo[];
}

console.log("send-store-data-email function initializing.");

serve(async (req: Request) => {
  console.log(`Request received: Method = ${req.method}, URL = ${req.url}`); // Log every request

  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request...");
    try {
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
        "Access-Control-Max-Age": "86400",
      };
      console.log("Responding to OPTIONS with headers:", JSON.stringify(headers));
      // Changed status to 204 and body to null
      return new Response(null, { status: 204, headers });
    } catch (e: any) {
      console.error("Error constructing OPTIONS response:", e.message, e.stack);
      return new Response("Error in OPTIONS handler", { status: 500 });
    }
  }

  if (req.method !== "POST") {
    console.log("Method not allowed:", req.method);
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const payload = await req.json() as RequestPayload;
    const { email, storesData } = payload;

    if (!email || !storesData || !Array.isArray(storesData)) {
      console.error("Invalid payload:", payload);
      return new Response(JSON.stringify({ error: "Missing email or storesData in request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    console.log(`Simulating email dispatch to: ${email}`);
    // console.log("Stores data received for email:", JSON.stringify(storesData, null, 2));

    // ---- Email Content Simulation ----
    const emailSubject = "Your Monitored Store Data - Initial Update";
    let emailBody = `Hello,\\\\n\\\\nThank you for subscribing! Here is the initial data for your monitored Shopify stores:\\\\n\\\\n`;

    if (storesData.length === 0) {
      emailBody += "No data was available for the stores at this moment.\\\\n";
    } else {
      storesData.forEach(store => {
        emailBody += `Store URL: ${store.url}\\\\n`;
        if (store.data && store.data.products && store.data.products.length > 0) {
          emailBody += `  Products (${store.data.products.length} found):\\\\n`;
          store.data.products.slice(0, 5).forEach((product: any) => { // Show first 5 products
            emailBody += `    - ${product.title} (Price: ${product.variants?.[0]?.price || 'N/A'})\\\\n`;
          });
          if (store.data.products.length > 5) {
            emailBody += `    ...and ${store.data.products.length - 5} more products.\\\\n`;
          }
        } else if (store.data && store.data.error) {
          emailBody += `  Could not fetch data: ${store.data.error}\\\\n`;
        }
         else {
          emailBody += "  No product data found, or the store might be empty.\\\\n";
        }
        emailBody += "\\\\n";
      });
    }
    emailBody += "You will receive periodic updates for these stores.\\\\n\\\\nThank you for using Competitor Watchdog!\\\\n";

    console.log("--- Simulated Email Content ---");
    console.log("To:", email);
    console.log("Subject:", emailSubject);
    // console.log("Body:\\\\n", emailBody); // Full body can be very long
    console.log(`Body Preview (first 500 chars):\\\\n${emailBody.substring(0,500).replace(/\\\\n/g, '\\\\n')}`);
    console.log("--- End Simulated Email Content ---");
    // In a real scenario, you would use an email sending service here.
    // Example: await sendEmailWithResend(email, emailSubject, emailBody);
    await sendEmailWithResend(email, emailSubject, emailBody);

    return new Response(JSON.stringify({ message: "Email dispatch process simulated successfully." }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (error: any) {
    console.error(`Error in send-store-data-email function: ${error.message}`, error.stack);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

// Helper function for actual email sending (example with Resend, not implemented here)
async function sendEmailWithResend(to: string, subject: string, htmlBody: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set. Skipping actual email dispatch.");
    // Return a response indicating the API key is missing, or handle as an error
    // For now, let's throw an error to make it clear in the logs if the key is missing.
    throw new Error("RESEND_API_KEY is not set. Cannot send email.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Competitor Watchdog <noreply@cohesyve.com>", // Replace with your verified Resend domain
      to: [to],
      subject: subject,
      html: htmlBody.replace(/\\\\n/g, "<br>"), // Convert newlines to <br> for HTML email
    }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    console.error("Failed to send email:", res.status, errorData);
    throw new Error(`Email sending failed: ${errorData.message}`);
  }
  console.log("Email sent successfully via Resend to:", to);
}

