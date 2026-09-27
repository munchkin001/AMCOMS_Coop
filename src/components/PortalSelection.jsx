import React from 'react';

const PortalSelection = () => {
  const portals = [
    {
      id: 'chairman',
      icon: '🛡️',
      title: 'Chairman Portal',
      description: 'Governance & oversight — financial statements, executive reports, audit compliance, and business performance.',
      color: 'blue',
      bgColor: 'bg-blue-100',
      iconBg: 'bg-blue-600',
      textColor: 'text-blue-600',
      hoverBg: 'hover:bg-blue-50'
    },
    {
      id: 'manager',
      icon: '📊',
      title: 'Manager Portal',
      description: 'Unrestricted system access — members, loans, savings, business operations, reports, users, and settings.',
      color: 'green',
      bgColor: 'bg-green-100',
      iconBg: 'bg-green-600',
      textColor: 'text-green-600',
      hoverBg: 'hover:bg-green-50'
    },
    {
      id: 'treasurer',
      icon: '📈',
      title: 'Treasurer Portal',
      description: 'Transaction-focused — loan collections, savings, income, expenses, and cash flow.',
      color: 'teal',
      bgColor: 'bg-teal-100',
      iconBg: 'bg-teal-600',
      textColor: 'text-teal-600',
      hoverBg: 'hover:bg-teal-50'
    },
    {
      id: 'bookkeeper',
      icon: '📖',
      title: 'Bookkeeper Portal',
      description: 'Accounting records — income, expenses, cash flow, reconciliation, and financial reports.',
      color: 'purple',
      bgColor: 'bg-purple-100',
      iconBg: 'bg-purple-600',
      textColor: 'text-purple-600',
      hoverBg: 'hover:bg-purple-50'
    },
    {
      id: 'inventory',
      icon: '📦',
      title: 'Inventory Staff Portal',
      description: 'Inventory & production — coconut sugar, BFT products, deliveries, stock movements.',
      color: 'orange',
      bgColor: 'bg-orange-100',
      iconBg: 'bg-orange-600',
      textColor: 'text-orange-600',
      hoverBg: 'hover:bg-orange-50'
    },
    {
      id: 'member',
      icon: '👤',
      title: 'Member Portal',
      description: 'Personal self-service portal — savings, loans, time deposits, and transactions.',
      color: 'green',
      bgColor: 'bg-green-100',
      iconBg: 'bg-green-700',
      textColor: 'text-green-700',
      hoverBg: 'hover:bg-green-50'
    }
  ];

  const handlePortalSelect = (portalId) => {
    // Navigate to login page for specific portal
    window.location.href = `/login/${portalId}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <img src="/LOGO.png" alt="Agay-ayan MPC Logo" className="w-16 h-16 object-contain" />
            <div className="text-left">
              <h1 className="text-3xl font-bold text-gray-900">AMCOMS</h1>
              <p className="text-sm text-gray-500">MANAGEMENT SYSTEM</p>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Agay-ayan Multi-Purpose Cooperative
          </h2>
          <p className="text-gray-600">
            Please select your portal to continue.
          </p>
        </div>

        {/* Portal Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {portals.map((portal) => (
            <div
              key={portal.id}
              className={`bg-white rounded-xl shadow-md ${portal.hoverBg} transition-all hover:shadow-xl cursor-pointer p-6`}
              onClick={() => handlePortalSelect(portal.id)}
            >
              {/* Icon */}
              <div className={`${portal.iconBg} w-14 h-14 rounded-xl flex items-center justify-center mb-4`}>
                <span className="text-2xl">{portal.icon}</span>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                {portal.title}
              </h3>

              {/* Description */}
              <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                {portal.description}
              </p>

              {/* Select Button */}
              <button className={`${portal.textColor} font-semibold text-sm flex items-center space-x-2 hover:underline`}>
                <span>Select Portal</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-2">
            Agay-Ayan Multi-Purpose Cooperative | Agay-ayan, Gingoog City, Misamis Oriental
          </p>
          <a 
            href="/" 
            className="text-gray-600 hover:text-green-600 text-sm flex items-center justify-center space-x-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Website</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default PortalSelection;
