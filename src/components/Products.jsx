import React from 'react';

const Products = () => {
  return (
    <section id="products" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-4">
          <span className="text-green-600 font-semibold text-sm uppercase tracking-wide">Our Products</span>
        </div>
        
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
          Barangay Food Terminal
        </h2>
        
        <p className="text-center text-gray-600 mb-12 max-w-3xl mx-auto">
          Affordable agricultural products and essential commodities for the community — 
          supporting local farmers while delivering quality to every household.
        </p>

        {/* Info Banner */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl p-8 mb-12 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <span className="text-5xl">🏪</span>
            <div className="text-left">
              <h3 className="text-2xl font-bold">Barangay Food Terminal</h3>
              <p className="text-green-100">Serving the Community with Quality Products</p>
            </div>
          </div>
          <p className="text-green-50 max-w-2xl mx-auto">
            Visit our food terminal for fresh produce, grains, and essential commodities 
            at fair prices. We work directly with local farmers to bring you quality products.
          </p>
        </div>

        {/* Featured Products Showcase */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">
            Featured Cooperative Products
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Coconut Sugar */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="h-64 overflow-hidden">
                <img 
                  src="/sugar.jpg" 
                  alt="Coconut Sugar" 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">Coconut Sugar</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Natural sweetener made from coconut palm sap. Rich in nutrients and low glycemic index.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-semibold">Premium Quality</span>
                  <span className="text-sm text-gray-500">Locally Produced</span>
                </div>
              </div>
            </div>

            {/* Turmeric */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="h-64 overflow-hidden">
                <img 
                  src="/turmeric.jpg" 
                  alt="Turmeric" 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">Turmeric</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Fresh organic turmeric known for its anti-inflammatory properties and culinary uses.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-semibold">Organic</span>
                  <span className="text-sm text-gray-500">Farm Fresh</span>
                </div>
              </div>
            </div>

            {/* Crunch Product */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="h-64 overflow-hidden">
                <img 
                  src="/crunch.jpg" 
                  alt="Crunch Snacks" 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">Crunch Snacks</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Delicious locally-made snacks perfect for any time of the day. Made with quality ingredients.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-semibold">Best Seller</span>
                  <span className="text-sm text-gray-500">Made in Gingoog</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-2">Fair Pricing</h4>
            <p className="text-sm text-gray-600">
              Competitive prices that benefit both farmers and consumers
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-2">Quality Assured</h4>
            <p className="text-sm text-gray-600">
              Fresh products sourced from trusted local suppliers
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-2">Community Support</h4>
            <p className="text-sm text-gray-600">
              Supporting local farmers and strengthening the community
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Products;
