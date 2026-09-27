import React from 'react';

const Membership = () => {
  return (
    <section id="membership" className="py-12 sm:py-16 md:py-20 bg-green-700 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-4">
          <span className="text-green-200 font-semibold text-xs sm:text-sm uppercase tracking-wide">Join the Cooperative</span>
        </div>
        
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4">
          Become a Member Today
        </h2>
        
        <p className="text-center text-sm sm:text-base text-green-100 mb-12 sm:mb-16 max-w-3xl mx-auto px-4">
          Join over 260 members and gain access to savings, loans, dividends, and cooperative benefits.
        </p>

        <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-8 sm:mb-12">
          {/* Membership Fees */}
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-6 sm:p-8">
            <div className="bg-green-600 w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center mb-4 sm:mb-6">
              <span className="text-2xl sm:text-3xl">💵</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Membership Fees</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white border-opacity-20 pb-3">
                <span className="text-sm sm:text-base text-green-100">Membership Fee</span>
                <span className="text-lg sm:text-xl font-bold">₱100</span>
              </div>
              <div className="flex justify-between items-center pb-3">
                <span className="text-sm sm:text-base text-green-100">Initial Capital Share</span>
                <span className="text-lg sm:text-xl font-bold">₱5,000 <span className="text-xs sm:text-sm font-normal">min</span></span>
              </div>
            </div>
          </div>

          {/* Applicant Information */}
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-6 sm:p-8">
            <div className="bg-green-600 w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center mb-4 sm:mb-6">
              <span className="text-2xl sm:text-3xl">📋</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Applicant Information</h3>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm">Full Name</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm">Birthday</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm">Age</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm">Address</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm">Contact Number</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm">Emergency Contact</span>
              </div>
              <div className="flex items-center space-x-2 col-span-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm">Family Members</span>
              </div>
            </div>
          </div>

          {/* Required IDs */}
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-6 sm:p-8">
            <div className="bg-green-600 w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center mb-4 sm:mb-6">
              <span className="text-2xl sm:text-3xl">🪪</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Required IDs</h3>
            
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base sm:text-lg">RSBSA</span>
              </div>
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base sm:text-lg">TIN</span>
              </div>
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base sm:text-lg">NCFRS</span>
              </div>
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base sm:text-lg">PCA ID</span>
              </div>
            </div>

            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white border-opacity-20">
              <p className="text-xs sm:text-sm text-green-100">
                These IDs verify applicants before approving membership and future loan applications.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-lg sm:text-xl md:text-2xl font-semibold mb-4 sm:mb-6 px-4">
            Visit our office to start your application.
          </p>
          <a 
            href="#contact"
            className="inline-block bg-white text-green-700 px-6 sm:px-8 py-3 sm:py-4 rounded-lg hover:bg-green-50 transition-colors text-base sm:text-lg font-semibold"
          >
            Contact Us
          </a>
        </div>
      </div>
    </section>
  );
};

export default Membership;
