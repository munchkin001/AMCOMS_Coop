import React from 'react';
import { Link } from 'react-router-dom';

const DemoPages = () => {
  const pages = [
    {
      title: 'Landing Page',
      description: 'Public-facing homepage with cooperative information, products, services, and membership details',
      link: '/',
      color: 'green'
    },
    {
      title: 'Login Page',
      description: 'Secure authentication with portal-specific login (e.g., /login/chairman for Chairman Portal)',
      link: '/login/chairman',
      color: 'blue'
    },
    {
      title: 'Portal Selection',
      description: 'Visual overview of all available portals (for reference/demo purposes only)',
      link: '/portal-selection',
      color: 'purple'
    },
    {
      title: 'Forgot Password',
      description: 'Password recovery with cooperative administrator contact information',
      link: '/forgot-password',
      color: 'orange'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-16 h-16 bg-green-700 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-2xl">A</span>
            </div>
            <div className="text-left">
              <h1 className="text-4xl font-bold text-gray-900">AMCOMS</h1>
              <p className="text-sm text-gray-500">Demo Pages</p>
            </div>
          </div>
          
          <p className="text-gray-600 max-w-2xl mx-auto">
            Explore all available pages in the AMCOMS system. This demo showcase includes the 
            landing page, authentication, and portal interfaces.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {pages.map((page, idx) => (
            <Link
              key={idx}
              to={page.link}
              className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-8 group"
            >
              <div className={`bg-${page.color}-100 w-14 h-14 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <svg className={`w-7 h-7 text-${page.color}-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3 group-hover:text-green-600 transition-colors">
                {page.title}
              </h3>

              <p className="text-gray-600 mb-4">
                {page.description}
              </p>

              <div className="flex items-center text-green-600 font-semibold">
                <span>View Page</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Testing Credentials */}
        <div className="mt-12 bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Testing Credentials & Login Flow</h2>
          <p className="text-gray-600 mb-6">
            The new flow: Landing Page → Portal Selection → Login (specific portal) → Authenticate → Portal Dashboard
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-semibold text-gray-900 mb-2">Chairman Portal</p>
              <p className="text-sm text-gray-600 mb-2">
                <a href="/login/chairman" className="text-blue-600 hover:underline">
                  /login/chairman
                </a>
              </p>
              <p className="text-sm text-gray-600">Username: <code className="bg-gray-100 px-2 py-1 rounded">chairman</code></p>
              <p className="text-sm text-gray-600">Password: <code className="bg-gray-100 px-2 py-1 rounded">password</code></p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-semibold text-gray-900 mb-2">Manager Portal</p>
              <p className="text-sm text-gray-600 mb-2">
                <a href="/login/manager" className="text-blue-600 hover:underline">
                  /login/manager
                </a>
              </p>
              <p className="text-sm text-gray-600">Username: <code className="bg-gray-100 px-2 py-1 rounded">manager</code></p>
              <p className="text-sm text-gray-600">Password: <code className="bg-gray-100 px-2 py-1 rounded">password</code></p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-semibold text-gray-900 mb-2">Treasurer Portal</p>
              <p className="text-sm text-gray-600 mb-2">
                <a href="/login/treasurer" className="text-blue-600 hover:underline">
                  /login/treasurer
                </a>
              </p>
              <p className="text-sm text-gray-600">Username: <code className="bg-gray-100 px-2 py-1 rounded">treasurer</code></p>
              <p className="text-sm text-gray-600">Password: <code className="bg-gray-100 px-2 py-1 rounded">password</code></p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-semibold text-gray-900 mb-2">Bookkeeper Portal</p>
              <p className="text-sm text-gray-600 mb-2">
                <a href="/login/bookkeeper" className="text-blue-600 hover:underline">
                  /login/bookkeeper
                </a>
              </p>
              <p className="text-sm text-gray-600">Username: <code className="bg-gray-100 px-2 py-1 rounded">bookkeeper</code></p>
              <p className="text-sm text-gray-600">Password: <code className="bg-gray-100 px-2 py-1 rounded">password</code></p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-semibold text-gray-900 mb-2">Inventory Staff Portal</p>
              <p className="text-sm text-gray-600 mb-2">
                <a href="/login/inventory" className="text-blue-600 hover:underline">
                  /login/inventory
                </a>
              </p>
              <p className="text-sm text-gray-600">Username: <code className="bg-gray-100 px-2 py-1 rounded">inventory</code></p>
              <p className="text-sm text-gray-600">Password: <code className="bg-gray-100 px-2 py-1 rounded">password</code></p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-semibold text-gray-900 mb-2">Member Portal</p>
              <p className="text-sm text-gray-600 mb-2">
                <a href="/login/member" className="text-blue-600 hover:underline">
                  /login/member
                </a>
              </p>
              <p className="text-sm text-gray-600">Username: <code className="bg-gray-100 px-2 py-1 rounded">member</code></p>
              <p className="text-sm text-gray-600">Password: <code className="bg-gray-100 px-2 py-1 rounded">password</code></p>
            </div>
          </div>
        </div>

        {/* Key Features */}
        <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-6">
          <h3 className="font-bold text-green-900 mb-3">🔐 Updated Login Flow</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✓ Portal Selection page displays all 6 available portals</li>
            <li>✓ User clicks on desired portal (e.g., "Chairman Portal")</li>
            <li>✓ System shows login form specific to that portal</li>
            <li>✓ User enters credentials and authenticates</li>
            <li>✓ System verifies user has access to selected portal</li>
            <li>✓ If authorized, redirects to portal dashboard</li>
            <li>✓ If not authorized, shows access denied message</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DemoPages;
