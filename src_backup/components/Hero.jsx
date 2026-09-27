import React from 'react';
import { Link } from 'react-router-dom';

const Hero = () => {
  return (
    <section id="home" className="relative bg-gradient-to-br from-green-700 via-green-800 to-green-900 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-600 rounded-full opacity-20 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-green-600 rounded-full opacity-20 translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Welcome to<br />
              <span className="text-green-300">Agay-ayan</span><br />
              Multi-Purpose<br />
              Cooperative
            </h1>
            <p className="text-lg md:text-xl text-green-100 mb-8 max-w-lg mx-auto lg:mx-0">
              Empowering our community through cooperative values. Serving our members with
              financial services, livelihood programs, and sustainable development.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                to="/"
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-green-800 font-bold rounded-xl hover:bg-green-50 transition-colors shadow-lg text-lg"
              >
                Access Portal
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href="#about"
                className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-white font-bold rounded-xl hover:bg-white/10 transition-colors text-lg"
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Hero Image */}
          <div className="hidden lg:block">
            <div className="relative">
              <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20">
                <img
                  src="/LOGO.png"
                  alt="AMCOMS Cooperative"
                  className="w-full max-w-md mx-auto rounded-2xl shadow-2xl"
                />
                <div className="text-center mt-6">
                  <p className="text-white text-xl font-bold">Agay-ayan, Gingoog City</p>
                  <p className="text-green-200">Misamis Oriental, Philippines</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:block">
          <div className="w-6 h-10 border-2 border-white/50 rounded-full flex justify-center">
            <div className="w-1.5 h-3 bg-white/70 rounded-full mt-2 animate-bounce" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
