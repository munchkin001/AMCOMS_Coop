import React from 'react';
import { useNavigate } from 'react-router-dom';

const PortalSelection = () => {
  const navigate = useNavigate();

  const handleStaffLogin = () => {
    navigate('/staff-login');
  };

  const handleMemberLogin = () => {
    navigate('/member-login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-blue-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center space-x-4 mb-6">
            <img src="/LOGO.png" alt="Agay-ayan MPC Logo" className="w-24 h-24 object-contain" />
            <div className="text-left">
              <h1 className="text-4xl font-bold text-gray-900">AMCOMS</h1>
              <p className="text-base text-gray-600 font-medium">Management System</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Agay-ayan Multi-Purpose Cooperative
          </h2>
          <p className="text-xl text-gray-700 font-medium">
            Please select your portal to continue
          </p>
        </div>

        {/* Portal Options */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {/* Staff Portal */}
          <div
            onClick={handleStaffLogin}
            className="bg-white rounded-3xl shadow-2xl hover:shadow-3xl transition-all cursor-pointer transform hover:scale-105 border-4 border-blue-100 hover:border-blue-300"
          >
            <div className="p-10">
              {/* Icon */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 w-28 h-28 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-3xl font-bold text-gray-900 mb-4 text-center">
                Staff Portal
              </h3>

              {/* Description */}
              <p className="text-gray-700 text-lg leading-relaxed mb-6 text-center">
                For Chairman, Manager, Treasurer, Bookkeeper, and Inventory Staff
              </p>

              {/* Features List */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Manage members and applications</span>
                </li>
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Process transactions and loans</span>
                </li>
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>View financial reports</span>
                </li>
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Manage inventory and products</span>
                </li>
              </ul>

              {/* Select Button */}
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold py-5 px-6 rounded-xl transition-colors shadow-lg flex items-center justify-center space-x-2">
                <span>Enter Staff Portal</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Member Portal */}
          <div
            onClick={handleMemberLogin}
            className="bg-white rounded-3xl shadow-2xl hover:shadow-3xl transition-all cursor-pointer transform hover:scale-105 border-4 border-green-100 hover:border-green-300"
          >
            <div className="p-10">
              {/* Icon */}
              <div className="bg-gradient-to-br from-green-600 to-green-700 w-28 h-28 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-3xl font-bold text-gray-900 mb-4 text-center">
                Member Portal
              </h3>

              {/* Description */}
              <p className="text-gray-700 text-lg leading-relaxed mb-6 text-center">
                For Cooperative Members - Self-Service Portal
              </p>

              {/* Features List */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-green-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>View your savings and loans</span>
                </li>
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-green-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Apply for loans online</span>
                </li>
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-green-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Request savings deposits</span>
                </li>
                <li className="flex items-center text-base text-gray-700">
                  <svg className="w-6 h-6 text-green-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Track transaction history</span>
                </li>
              </ul>

              {/* Select Button */}
              <button className="w-full bg-green-600 hover:bg-green-700 text-white text-xl font-bold py-5 px-6 rounded-xl transition-colors shadow-lg flex items-center justify-center space-x-2">
                <span>Enter Member Portal</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Information Box */}
        <div className="max-w-3xl mx-auto bg-blue-50 border-2 border-blue-200 rounded-2xl p-8 mb-8">
          <div className="flex items-start space-x-4">
            <svg className="w-10 h-10 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-xl font-bold text-blue-900 mb-3">Need Help?</h4>
              <p className="text-lg text-blue-800 leading-relaxed">
                <strong>Staff:</strong> Use your assigned email and password to access the Staff Portal.
              </p>
              <p className="text-lg text-blue-800 leading-relaxed mt-2">
                <strong>Members:</strong> If you don't have an account yet, you can create one in the Member Portal.
                Your application will be reviewed by our manager.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-base text-gray-600 mb-3 font-medium">
            Agay-Ayan Multi-Purpose Cooperative
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Agay-ayan, Gingoog City, Misamis Oriental
          </p>
          <a
            href="/"
            className="text-gray-700 hover:text-green-600 text-lg flex items-center justify-center space-x-2 transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
