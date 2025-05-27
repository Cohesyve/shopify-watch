import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

interface StoreInfo {
  id: string;
  url: string;
  data: any; // Contains product info, etc.
}

interface RequestPayload {
  email: string;
  storesData: StoreInfo[];
}

interface Product {
  title: string;
  variants?: { price?: string }[];
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

    const emailSubject = "Your Monitored Store Data - Initial Update";
    let emailHtmlBody = `
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; color: #333;">
  <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">Competitor Watchdog Alert</h1>
    <p>Hello,</p>
    <p>Thank you for subscribing! Here is the initial data for your monitored Shopify stores:</p>
`;

    if (storesData.length === 0) {
      emailHtmlBody += "<p>No data was available for the stores at this moment.</p>";
    } else {
      storesData.forEach(store => {
        emailHtmlBody += `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px;">
          <h2 style="color: #555; margin-top: 0;">Store URL: <a href="${store.url}" style="color: #007bff; text-decoration: none;">${store.url}</a></h2>
        `;
        if (store.data && store.data.products && store.data.products.length > 0) {
          emailHtmlBody += `<p><strong>Products (${store.data.products.length} found):</strong></p><ul style="list-style-type: none; padding-left: 0;">`;
          store.data.products.slice(0, 5).forEach((product: Product) => {
            emailHtmlBody += `
            <li style="margin-bottom: 10px; padding: 10px; background-color: #f9f9f9; border-radius: 4px;">
              <strong>${product.title}</strong><br>
              Price: ${product.variants?.[0]?.price || 'N/A'}
            </li>`;
          });
          if (store.data.products.length > 5) {
            emailHtmlBody += `<li style="margin-top: 10px;"><em>...and ${store.data.products.length - 5} more products.</em></li>`;
          }
          emailHtmlBody += "</ul>";
        } else if (store.data && store.data.error) {
          emailHtmlBody += `<p style="color: red;">Could not fetch data: ${store.data.error}</p>`;
        } else {
          emailHtmlBody += "<p>No product data found, or the store might be empty.</p>";
        }
        emailHtmlBody += "</div>";
      });
    }
    emailHtmlBody += `
    <p>You will receive periodic updates for these stores.</p>
    <p>Thank you for using Competitor Watchdog!</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 0.9em; color: #777;">If you did not request this, please ignore this email.</p>
  </div>
</body>
    `;

    console.log("--- Simulated HTML Email Content ---");
    console.log("To:", email);
    console.log("Subject:", emailSubject);
    console.log(`Body Preview (first 500 chars):\n${emailHtmlBody.substring(0,500).replace(/\n/g, '\\n')}`);
    console.log("--- End Simulated HTML Email Content ---\\n");

    // await sendEmailWithResend(email, emailSubject, emailHtmlBody);
    console.log("Email sending is disabled."); // Added log

    return new Response(JSON.stringify({ message: "Email dispatch process simulated successfully. Email sending is disabled." }), {
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
    throw new Error("RESEND_API_KEY is not set. Cannot send email.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Competitor Watchdog <noreply@cohesyve.com>",
      to: [to],
      subject: subject,
      html: htmlBody,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    console.error("Failed to send email:", res.status, errorData);
    throw new Error(`Email sending failed: ${errorData.message}`);
  }
  console.log("Email sent successfully via Resend to:", to);
}

