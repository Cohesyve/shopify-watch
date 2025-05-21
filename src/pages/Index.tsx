
import { useState } from "react";
import CompetitorTracker from "@/components/CompetitorTracker";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">ShopifyWatch</h1>
          <p className="text-gray-600 mt-1">Monitor your competitors' Shopify stores effortlessly</p>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <CompetitorTracker />
        </div>
      </main>
      
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm">
            ShopifyWatch - Monitor competitors' products and pricing changes
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
