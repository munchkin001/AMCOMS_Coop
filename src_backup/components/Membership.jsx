import React from 'react';
import { Link } from 'react-router-dom';

const Membership = () => {
  const benefits = [
    'Competitive interest rates on savings',
    'Access to low-interest loan programs',
    'Annual dividends and patronage refunds',
    'Free financial advisory services',
    'Exclusive access to cooperative products',
    'Voting rights in cooperative matters',
    'Participation in livelihood training',
    'Insurance and benefit programs',
  ];

  return (
    <section id="membership" className="py-20 bg-gradient-to-br from-green-700 to-green-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <span className="text-green-300 font-semibold text-sm uppercase tracking-wider">Join Us</span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-2 mb-6">
              Become a Member Today
            </h2>
            <p className="text-green-100 text-lg mb-8 leading-relaxed">
              Join hundreds of members who are already enjoying the benefits of cooperative
              membership. Together, we build a stronger and more prosperous community.
            </p>

            <ul className="space-y-3 mb-8">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-green-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-white">{benefit}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/member/register"
              className="inline-flex items-center px-8 py-4 bg-white text-green-800 font-bold rounded-xl hover:bg-green-50 transition-colors shadow-lg text-lg"
            >
              Apply Now
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>

          {/* Image */}
          <div className="hidden lg:block">
            <img
              src="/3.jpg"
              alt="Cooperative members"
              className="rounded-2xl shadow-2xl w-full object-cover aspect-square"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Membership;
