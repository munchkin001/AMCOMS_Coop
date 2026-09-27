import React from 'react';

const About = () => {
  return (
    <section id="about" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Image Grid */}
          <div className="grid grid-cols-2 gap-4">
            <img src="/1.jpg" alt="Community" className="rounded-2xl shadow-lg w-full h-48 object-cover" />
            <img src="/2.jpg" alt="Cooperative" className="rounded-2xl shadow-lg w-full h-48 object-cover mt-8" />
            <img src="/3.jpg" alt="Products" className="rounded-2xl shadow-lg w-full h-48 object-cover" />
            <img src="/4.jpg" alt="Members" className="rounded-2xl shadow-lg w-full h-48 object-cover mt-8" />
            <img src="/5.jpg" alt="Activities" className="rounded-2xl shadow-lg w-full h-48 object-cover col-span-2" />
          </div>

          {/* Content */}
          <div>
            <span className="text-green-600 font-semibold text-sm uppercase tracking-wider">About Us</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-6">
              Serving Our Community for Over 15 Years
            </h2>
            <p className="text-gray-600 text-lg mb-6 leading-relaxed">
              The Agay-ayan Multi-Purpose Cooperative is a community-based organization
              dedicated to improving the lives of our members through financial services,
              livelihood programs, and cooperative principles.
            </p>
            <p className="text-gray-600 text-lg mb-8 leading-relaxed">
              We believe in the power of cooperation — that together, we can achieve
              financial stability, sustainable growth, and a better quality of life for all.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-3xl font-bold text-green-700">500+</p>
                <p className="text-gray-600 text-sm">Members</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-3xl font-bold text-green-700">₱2M+</p>
                <p className="text-gray-600 text-sm">Total Savings</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-3xl font-bold text-green-700">100+</p>
                <p className="text-gray-600 text-sm">Loans Released</p>
              </div>
            </div>

            {/* Features */}
            <ul className="space-y-3">
              {['Member-owned and democratically controlled', 'Competitive interest rates on savings', 'Accessible loan programs for all members', 'Community development initiatives'].map((item, i) => (
                <li key={i} className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
