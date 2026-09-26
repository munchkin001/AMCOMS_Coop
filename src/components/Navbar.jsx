import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsOpen(false);
  };

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/home" className="flex items-center space-x-2">
            <img src="/LOGO.png" alt="AMCOMS Logo" className="h-10 w-10 object-contain" />
            <div>
              <span className="text-xl font-bold text-green-700">AMCOMS</span>
              <p className="text-[10px] text-gray-500 leading-none">Agay-ayan Multi-Purpose Cooperative</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <button onClick={() => scrollToSection('home')} className="text-gray-700 hover:text-green-600 transition-colors text-sm font-medium">
              Home
            </button>
            <button onClick={() => scrollToSection('about')} className="text-gray-700 hover:text-green-600 transition-colors text-sm font-medium">
              About
            </button>
            <button onClick={() => scrollToSection('services')} className="text-gray-700 hover:text-green-600 transition-colors text-sm font-medium">
              Services
            </button>
            <button onClick={() => scrollToSection('products')} className="text-gray-700 hover:text-green-600 transition-colors text-sm font-medium">
              Products
            </button>
            <button onClick={() => scrollToSection('membership')} className="text-gray-700 hover:text-green-600 transition-colors text-sm font-medium">
              Membership
            </button>
            <button onClick={() => scrollToSection('reviews')} className="text-gray-700 hover:text-green-600 transition-colors text-sm font-medium">
              Reviews
            </button>
            <button onClick={() => scrollToSection('contact')} className="text-gray-700 hover:text-green-600 transition-colors text-sm font-medium">
              Contact
            </button>
            <Link
              to="/"
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Portal Login
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-md text-gray-700 hover:bg-gray-100"
            onClick={() => setIsOpen(!isOpen)}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <button onClick={() => scrollToSection('home')} className="block w-full text-left px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Home</button>
            <button onClick={() => scrollToSection('about')} className="block w-full text-left px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">About</button>
            <button onClick={() => scrollToSection('services')} className="block w-full text-left px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Services</button>
            <button onClick={() => scrollToSection('products')} className="block w-full text-left px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Products</button>
            <button onClick={() => scrollToSection('membership')} className="block w-full text-left px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Membership</button>
            <button onClick={() => scrollToSection('reviews')} className="block w-full text-left px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Reviews</button>
            <button onClick={() => scrollToSection('contact')} className="block w-full text-left px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Contact</button>
            <Link to="/" className="block w-full text-center bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-semibold mt-2">
              Portal Login
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
