import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="bg-white shadow-sm fixed w-full top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20">
          {/* Logo and Brand */}
          <Link to="/" className="flex items-center space-x-2 sm:space-x-3">
            <img src="/LOGO.png" alt="Agay-ayan MPC Logo" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
            <div>
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">Agay-ayan Multi-Purpose Cooperative</h1>
              <p className="text-xs text-gray-500 hidden sm:block">EST. 30+ YEARS</p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center space-x-6 xl:space-x-8">
            <a href="#home" className="text-gray-700 hover:text-green-700 font-medium text-sm xl:text-base">Home</a>
            <a href="#about" className="text-gray-700 hover:text-green-700 font-medium text-sm xl:text-base">About</a>
            <a href="#products" className="text-gray-700 hover:text-green-700 font-medium text-sm xl:text-base">Products</a>
            <a href="#services" className="text-green-700 hover:text-green-800 font-medium text-sm xl:text-base">Services</a>
            <a href="#membership" className="text-gray-700 hover:text-green-700 font-medium text-sm xl:text-base">Membership</a>
            <a href="#reviews" className="text-gray-700 hover:text-green-700 font-medium text-sm xl:text-base">Reviews</a>
            <a href="#contact" className="text-gray-700 hover:text-green-700 font-medium text-sm xl:text-base">Contact</a>
            
            {/* Login Button */}
            <Link 
              to="/portal-selection"
              className="bg-green-700 text-white px-4 xl:px-6 py-2 rounded-lg hover:bg-green-800 transition-colors flex items-center space-x-2 text-sm xl:text-base"
            >
              <svg className="w-4 h-4 xl:w-5 xl:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>Login Portal</span>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-green-700 p-2"
            >
              {isMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden pb-4 border-t border-gray-100">
            <div className="flex flex-col space-y-3 pt-4">
              <a href="#home" onClick={() => setIsMenuOpen(false)} className="text-gray-700 hover:text-green-700 font-medium py-2 px-4 hover:bg-gray-50 rounded">Home</a>
              <a href="#about" onClick={() => setIsMenuOpen(false)} className="text-gray-700 hover:text-green-700 font-medium py-2 px-4 hover:bg-gray-50 rounded">About</a>
              <a href="#products" onClick={() => setIsMenuOpen(false)} className="text-gray-700 hover:text-green-700 font-medium py-2 px-4 hover:bg-gray-50 rounded">Products</a>
              <a href="#services" onClick={() => setIsMenuOpen(false)} className="text-green-700 hover:text-green-800 font-medium py-2 px-4 hover:bg-gray-50 rounded">Services</a>
              <a href="#membership" onClick={() => setIsMenuOpen(false)} className="text-gray-700 hover:text-green-700 font-medium py-2 px-4 hover:bg-gray-50 rounded">Membership</a>
              <a href="#reviews" onClick={() => setIsMenuOpen(false)} className="text-gray-700 hover:text-green-700 font-medium py-2 px-4 hover:bg-gray-50 rounded">Reviews</a>
              <a href="#contact" onClick={() => setIsMenuOpen(false)} className="text-gray-700 hover:text-green-700 font-medium py-2 px-4 hover:bg-gray-50 rounded">Contact</a>
              
              {/* Mobile Login Button */}
              <Link 
                to="/portal-selection"
                onClick={() => setIsMenuOpen(false)}
                className="bg-green-700 text-white px-4 py-3 rounded-lg hover:bg-green-800 transition-colors flex items-center justify-center space-x-2 font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>Login Portal</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
