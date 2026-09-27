import React from 'react';
import { Link } from 'react-router-dom';
import heroImg from '../assets/hero.png';

const Hero = () => {
  return (
    <section id="home" className="relative w-full min-h-screen bg-cover bg-center" style={{
      backgroundImage: `linear-gradient(rgba(22, 101, 52, 0.45), rgba(22, 101, 52, 0.55)), url(/5.jpg)`
    }}>
      <div className="w-full px-8 sm:px-12 md:px-16 lg:px-24 xl:px-32 pt-48 md:pt-56 lg:pt-64 xl:pt-72 pb-20 md:pb-24 lg:pb-32">
        <div className="max-w-7xl mx-auto">
          {/* Badge */}
          <div className="mb-8 md:mb-10 lg:mb-12">
            <span className="inline-block bg-green-600 bg-opacity-50 text-white px-4 py-2 rounded-full text-xs sm:text-sm">
              ✓ Serving Agay-Ayan Since 1990+
            </span>
          </div>

          {/* Main Heading */}
          <div className="max-w-4xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-tight mb-6 md:mb-8 lg:mb-10">
              Premium Coconut Sugar from <span className="text-green-300">Agay-Ayan</span> Multipurpose Cooperative
            </h1>
            
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-white text-opacity-90 mb-10 md:mb-12 lg:mb-16 leading-relaxed max-w-3xl">
              Naturally produced from 100% coconut sap by local farmers in Gingoog City. 
              Our flagship coconut sugar offers a healthier natural sweetener while 
              supporting sustainable livelihoods and community development.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mb-12 md:mb-16 lg:mb-20">
              <a href="#products" className="bg-green-600 text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center sm:justify-start space-x-2 text-base sm:text-lg font-semibold">
                <span>View Products</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a href="#membership" className="bg-transparent border-2 border-white text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-lg hover:bg-white hover:text-green-700 transition-colors text-base sm:text-lg font-semibold text-center">
                Become a Member
              </a>
              <Link to="/portal-selection" className="bg-transparent border-2 border-white text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-lg hover:bg-white hover:text-green-700 transition-colors flex items-center justify-center sm:justify-start space-x-2 text-base sm:text-lg font-semibold">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>Login</span>
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 sm:p-6 rounded-lg text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">260</div>
                <div className="text-white text-opacity-80 text-xs sm:text-sm">Registered Members</div>
              </div>
              <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 sm:p-6 rounded-lg text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">70%</div>
                <div className="text-white text-opacity-80 text-xs sm:text-sm">Active Members</div>
              </div>
              <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 sm:p-6 rounded-lg text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">30+</div>
                <div className="text-white text-opacity-80 text-xs sm:text-sm">Years of Service</div>
              </div>
              <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 sm:p-6 rounded-lg text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">BFT</div>
                <div className="text-white text-opacity-80 text-xs sm:text-sm">Food Terminal Partner</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
