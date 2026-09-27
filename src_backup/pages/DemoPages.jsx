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
          {pages.map((page, index) => (
            <Link
              key={index}
              to={page.link}
              className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 block"
            >
              <div className={`w-12 h-12 rounded-lg mb-4 flex items-center justify-center ${
                page.color === 'green' ? 'bg-green-100' :
                page.color === 'blue' ? 'bg-blue-100' :
                page.color === 'purple' ? 'bg-purple-100' :
                'bg-orange-100'
              }`}>
                <svg className={`w-6 h-6 ${
                  page.color === 'green' ? 'text-green-600' :
                  page.color === 'blue' ? 'text-blue-600' :
                  page.color === 'purple' ? 'text-purple-600' :
                  'text-orange-600'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{page.title}</h3>
              <p className="text-gray-600 mb-4">{page.description}</p>
              <span className="text-green-600 font-medium flex items-center">
                Visit Page
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </Link>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            to="/"
            className="inline-flex items-center text-gray-600 hover:text-green-600 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Website
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DemoPages;
