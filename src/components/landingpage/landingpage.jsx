import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeDollarSign, ChartNoAxesCombined, Check, ClipboardList, Clock3, Handshake, IdCard, Sprout, Store } from 'lucide-react';
import './landingpage.css';


const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="amcoms-navbar bg-white shadow-sm fixed w-full top-0 z-50">
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
              className="bg-green-700 text-white px-4 xl:px-6 py-2 rounded-lg hover:bg-green-800 transition-colors flex items-center space-x-2 text-sm xl:text-base lg:translate-x-6"
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
              aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMenuOpen}
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




const Hero = () => {
  return (
    <section id="home" className="amcoms-hero relative w-full min-h-screen bg-cover bg-center" style={{
      backgroundImage: `linear-gradient(rgba(19, 43, 34, 0.56), rgba(19, 43, 34, 0.66)), url(/5.jpg)`
    }}>
      <div className="w-full px-8 sm:px-12 md:px-16 lg:px-24 xl:px-32 pt-48 md:pt-56 lg:pt-64 xl:pt-72 pb-20 md:pb-24 lg:pb-32">
        <div className="max-w-7xl mx-auto">
          {/* Badge */}
          <div className="mb-8 md:mb-10 lg:mb-12">
            <span className="inline-block bg-green-600 bg-opacity-50 text-white px-4 py-2 rounded-full text-xs sm:text-sm">
              <Check aria-hidden="true" /> Serving Agay-Ayan Since 1990+
            </span>
          </div>

          {/* Main Heading */}
          <div className="max-w-4xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-tight mb-6 md:mb-8 lg:mb-10">
              Coconut sugar, rooted in <span className="text-green-300">Agay&#8209;Ayan</span>
            </h1>
            
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-white text-opacity-90 mb-10 md:mb-12 lg:mb-16 leading-relaxed max-w-3xl">
              Naturally made from coconut sap by local farmers in Gingoog City, supporting
              sustainable livelihoods and community development.
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




const About = () => {
  return (
    <section id="about" className="py-12 sm:py-16 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-6 sm:mb-8">
          <span className="text-green-600 font-semibold text-xs sm:text-sm uppercase tracking-wide">About the Cooperative</span>
        </div>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left: Images Grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-3 sm:space-y-4">
              <div className="rounded-lg overflow-hidden h-48 sm:h-56 md:h-64 bg-gray-200">
                <img 
                  src="/1.jpg" 
                  alt="Cooperative Activities" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="rounded-lg overflow-hidden h-36 sm:h-40 md:h-48 bg-gray-200">
                <img 
                  src="/2.jpg" 
                  alt="Community Services" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="space-y-3 sm:space-y-4 pt-6 sm:pt-8">
              <div className="rounded-lg overflow-hidden h-36 sm:h-40 md:h-48 bg-gray-200">
                <img 
                  src="/3.jpg" 
                  alt="Products Display" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="rounded-lg overflow-hidden h-48 sm:h-56 md:h-64 bg-gray-200">
                <img 
                  src="/4.jpg" 
                  alt="Cooperative Members" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Right: Content */}
          <div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
              A Community-Driven Cooperative for Over Three Decades
            </h2>
            
            <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 leading-relaxed">
              Agay-Ayan Multi-Purpose Cooperative Inc. is a community-based cooperative located in 
              Agay-Ayan, Gingoog City, Misamis Oriental. For over three decades, the cooperative has 
              supported farmers, workers, and families through financial services, agricultural 
              production, and community development.
            </p>

            {/* Services Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base text-gray-700">Savings Accounts</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base text-gray-700">Time Deposits</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base text-gray-700">Loan Programs</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base text-gray-700">Barangay Food Terminal</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base text-gray-700">Coconut Sugar Production</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base text-gray-700">Agricultural Marketing</span>
              </div>
            </div>

            {/* Mission and Vision */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-green-50 p-4 sm:p-6 rounded-lg">
                <h3 className="text-base sm:text-lg font-bold text-green-800 mb-2">Mission</h3>
                <p className="text-xs sm:text-sm text-gray-700">
                  To empower members through financial services, quality products, and sustainable 
                  agricultural practices that uplift the community.
                </p>
              </div>
              <div className="bg-yellow-50 p-4 sm:p-6 rounded-lg">
                <h3 className="text-base sm:text-lg font-bold text-yellow-800 mb-2">Vision</h3>
                <p className="text-xs sm:text-sm text-gray-700">
                  A thriving cooperative that leads in agricultural innovation, member welfare, 
                  and community development in Misamis Oriental.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};




const Products = () => {
  return (
    <section id="products" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-4">
          <span className="text-green-600 font-semibold text-sm uppercase tracking-wide">Our Products</span>
        </div>
        
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
          Barangay Food Terminal
        </h2>
        
        <p className="text-center text-gray-600 mb-12 max-w-3xl mx-auto">
          Affordable agricultural products and essential commodities for the community — 
          supporting local farmers while delivering quality to every household.
        </p>

        {/* Featured Products Showcase */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">
            Featured Cooperative Products
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Coconut Sugar */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="h-64 overflow-hidden">
                <img 
                  src="/sugar.jpg" 
                  alt="Coconut Sugar" 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">Coconut Sugar</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Natural sweetener made from coconut palm sap. Rich in nutrients and low glycemic index.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-semibold">Premium Quality</span>
                  <span className="text-sm text-gray-500">Locally Produced</span>
                </div>
              </div>
            </div>

            {/* Turmeric */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="h-64 overflow-hidden">
                <img 
                  src="/turmeric.jpg" 
                  alt="Turmeric" 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">Turmeric</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Fresh organic turmeric known for its anti-inflammatory properties and culinary uses.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-semibold">Organic</span>
                  <span className="text-sm text-gray-500">Farm Fresh</span>
                </div>
              </div>
            </div>

            {/* Crunch Product */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="h-64 overflow-hidden">
                <img 
                  src="/crunch.jpg" 
                  alt="Crunch Snacks" 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">Crunch Snacks</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Delicious locally-made snacks perfect for any time of the day. Made with quality ingredients.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-semibold">Best Seller</span>
                  <span className="text-sm text-gray-500">Made in Gingoog</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="hidden grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-2">Fair Pricing</h4>
            <p className="text-sm text-gray-600">
              Competitive prices that benefit both farmers and consumers
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-2">Quality Assured</h4>
            <p className="text-sm text-gray-600">
              Fresh products sourced from trusted local suppliers
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-2">Community Support</h4>
            <p className="text-sm text-gray-600">
              Supporting local farmers and strengthening the community
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};




const Services = () => {
  const services = [
    {
      icon: BadgeDollarSign,
      title: 'Savings Accounts',
      description: 'Members can safely deposit money while earning annual dividends and interest depending on cooperative policies.',
      bgColor: 'bg-green-50',
      iconBg: 'bg-green-100'
    },
    {
      icon: Clock3,
      title: 'Time Deposits',
      description: 'Higher earning savings with fixed maturity periods and guaranteed returns for disciplined savers.',
      bgColor: 'bg-blue-50',
      iconBg: 'bg-blue-100'
    },
    {
      icon: Handshake,
      title: 'Loan Services',
      description: 'Members may apply for various loan programs subject to cooperative approval and eligibility requirements.',
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-100'
    },
    {
      icon: Sprout,
      title: 'Coconut Sugar Production',
      description: 'The cooperative purchases coconut sap from local farmers and processes it into high-quality coconut sugar products.',
      bgColor: 'bg-green-50',
      iconBg: 'bg-green-100'
    },
    {
      icon: Store,
      title: 'Barangay Food Terminal',
      description: 'Affordable agricultural products and essential commodities sold to the community while supporting local farmers.',
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-100'
    },
    {
      icon: ChartNoAxesCombined,
      title: 'Agricultural Marketing',
      description: 'The cooperative connects local farmers with buyers and markets, ensuring fair prices and sustainable livelihoods.',
      bgColor: 'bg-purple-50',
      iconBg: 'bg-purple-100'
    }
  ];

  return (
    <section id="services" className="py-12 sm:py-16 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-4">
          <span className="text-green-600 font-semibold text-xs sm:text-sm uppercase tracking-wide">Our Services</span>
        </div>
        
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
          Financial & Agricultural Services
        </h2>
        
        <p className="text-center text-sm sm:text-base text-gray-600 mb-12 sm:mb-16 max-w-3xl mx-auto px-4">
          Comprehensive support for members and the community — from savings and loans to 
          production and marketing.
        </p>

        {/* Services Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {services.map((service, idx) => (
            <div 
              key={idx} 
              className={`${service.bgColor} rounded-lg p-6 sm:p-8 hover:shadow-lg transition-shadow`}
            >
              <div className={`${service.iconBg} w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center mb-4 sm:mb-6`}>
                <service.icon aria-hidden="true" className="h-7 w-7 text-green-800" />
              </div>
              
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">
                {service.title}
              </h3>
              
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>

        {/* How AMCOMS Works */}
        <div className="hidden mt-12 sm:mt-16 md:mt-20 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 sm:p-8 md:p-12">
          <div className="text-center mb-8 sm:mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">How AMCOMS Works</h3>
            <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto px-4">
              Our system streamlines cooperative operations while maintaining the personal touch 
              of in-office transactions.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            <div className="text-center">
              <div className="bg-green-600 text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto mb-3 sm:mb-4">
                1
              </div>
              <h4 className="font-bold text-gray-900 mb-2 text-sm sm:text-base">Submit a Request</h4>
              <p className="text-gray-600 text-xs sm:text-sm px-2">
                Members can submit a request through the AMCOMS website.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-green-600 text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto mb-3 sm:mb-4">
                2
              </div>
              <h4 className="font-bold text-gray-900 mb-2 text-sm sm:text-base">Manager Reviews</h4>
              <p className="text-gray-600 text-xs sm:text-sm px-2">
                The Manager reviews and approves or declines the request.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-green-600 text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto mb-3 sm:mb-4">
                3
              </div>
              <h4 className="font-bold text-gray-900 mb-2 text-sm sm:text-base">Visit the Office</h4>
              <p className="text-gray-600 text-xs sm:text-sm px-2">
                Approved financial transactions are completed at the cooperative office.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-green-600 text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto mb-3 sm:mb-4">
                4
              </div>
              <h4 className="font-bold text-gray-900 mb-2 text-sm sm:text-base">Record & Update</h4>
              <p className="text-gray-600 text-xs sm:text-sm px-2">
                Transaction recorded by authorized staff and account updated.
              </p>
            </div>
          </div>

          <div className="text-center mt-6 sm:mt-8">
            <p className="text-sm sm:text-base text-gray-700 font-medium px-4 mb-4">
              Financial transactions are completed at the cooperative office.
            </p>
            <a 
              href="#membership"
              className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
            >
              Become a Member
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};




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
              <BadgeDollarSign aria-hidden="true" className="h-8 w-8" />
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
              <ClipboardList aria-hidden="true" className="h-8 w-8" />
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
              <IdCard aria-hidden="true" className="h-8 w-8" />
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




const Reviews = () => {
  const reviews = [
    {
      name: 'Jeff Doñahan',
      role: 'Google Reviewer',
      rating: 5,
      text: 'Known for their organic products such as coconut sugar.',
      avatar: 'J',
      color: 'bg-red-500'
    },
    {
      name: 'Shelou Pepfire',
      role: 'Google Reviewer',
      rating: 5,
      text: 'Nice place.',
      avatar: 'S',
      color: 'bg-yellow-500'
    },
    {
      name: 'Marie C.',
      role: 'Local Guide · Level 3',
      rating: 4,
      text: 'Rating only — no text review provided',
      avatar: 'M',
      color: 'bg-green-600'
    },
    {
      name: 'Rodel S.',
      role: 'Google Reviewer',
      rating: 5,
      text: 'Rating only — no text review provided',
      avatar: 'R',
      color: 'bg-teal-500'
    },
    {
      name: 'Ana Fernandez',
      role: 'Local Guide · Level 2',
      rating: 4,
      text: 'Rating only — no text review provided',
      avatar: 'A',
      color: 'bg-blue-600'
    },
    {
      name: 'Mark Dela Cruz',
      role: 'Google Reviewer',
      rating: 4,
      text: 'Rating only — no text review provided',
      avatar: 'M',
      color: 'bg-purple-600'
    }
  ];

  const renderStars = (rating) => {
    return [...Array(5)].map((_, index) => (
      <svg
        key={index}
        className={`w-5 h-5 ${index < rating ? 'text-yellow-400' : 'text-gray-300'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ));
  };

  return (
    <section id="reviews" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-4">
          <span className="text-green-600 font-semibold text-sm uppercase tracking-wide">REVIEWS</span>
        </div>
        
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-12">
          What People Are Saying
        </h2>

        {/* Google Rating Card */}
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8 mb-12 text-center">
          <div className="text-6xl font-bold text-gray-900 mb-2">4.1</div>
          <div className="text-gray-500 mb-3">/5.0</div>
          <div className="flex items-center justify-center gap-1 mb-3">
            {renderStars(4)}
          </div>
          <p className="text-sm text-gray-600">Based on Google Reviews</p>
          <p className="text-gray-600 mt-4 leading-relaxed">
            Agay-Ayan Multi-Purpose Cooperative Inc. has earned a 4.1-star Google rating from customers and 
            community members, reflecting its long-standing commitment to serving farmers, members, and the 
            local community.
          </p>
        </div>

        {/* Reviews Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {reviews.map((review, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
              {/* Reviewer Info */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`${review.color} w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg`}>
                  {review.avatar}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">{review.name}</h4>
                  <p className="text-xs text-gray-500">{review.role}</p>
                </div>
              </div>

              {/* Stars */}
              <div className="flex gap-1 mb-3">
                {renderStars(review.rating)}
              </div>

              {/* Review Text */}
              <p className="text-sm text-gray-700 italic">"{review.text}"</p>
            </div>
          ))}
        </div>

        {/* View More Button */}
        <div className="text-center">
          <a 
            href="https://www.google.com/maps/place/Agay-Ayan+Multi-Purpose+Cooperative+Inc./@8.8194,125.0895,17z" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span>View More Reviews on Google</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
};




const Contact = () => {
  // Coordinates for Agay-Ayan, Gingoog City, Misamis Oriental
  const mapEmbedUrl = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d63334.65602938794!2d125.0186!3d8.8286!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33014f3c5e5a0001%3A0x3e6d1e0a5e5a0001!2sAgay-ayan%2C%20Gingoog%20City%2C%20Misamis%20Oriental!5e0!3m2!1sen!2sph!4v1234567890";

  return (
    <section id="contact" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-4">
          <span className="text-green-600 font-semibold text-sm uppercase tracking-wide">Contact</span>
        </div>
        
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
          Get In Touch
        </h2>
        
        <p className="text-center text-gray-600 mb-16 max-w-3xl mx-auto">
          Visit our office or reach out to us. We're here to serve our members and community.
        </p>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Contact Information */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Contact Information</h3>
            
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Office Address</h4>
                  <p className="text-gray-600">
                    Agay-Ayan, Gingoog City<br />
                    Misamis Oriental, Philippines
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Contact Number</h4>
                  <p className="text-gray-600">
                    +63 XXX XXX XXXX<br />
                    +63 XXX XXX XXXX
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Email Address</h4>
                  <p className="text-gray-600">
                    info@agayayanmpc.coop<br />
                    contact@agayayanmpc.coop
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Office Hours</h4>
                  <p className="text-gray-600">
                    Monday - Friday: 8:00 AM - 5:00 PM<br />
                    Saturday: 8:00 AM - 12:00 PM<br />
                    Sunday: Closed
                  </p>
                </div>
              </div>
            </div>

            {/* Social Media */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <h4 className="font-bold text-gray-900 mb-4">Connect With Us</h4>
              <div className="flex space-x-4">
                <a href="#" className="bg-green-100 w-10 h-10 rounded-lg flex items-center justify-center hover:bg-green-200 transition-colors">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a href="#" className="bg-green-100 w-10 h-10 rounded-lg flex items-center justify-center hover:bg-green-200 transition-colors">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Google Map */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Our Location</h3>
            
            {/* Embedded Google Map */}
            <div className="rounded-lg overflow-hidden shadow-lg mb-6 h-96">
              <iframe
                src={mapEmbedUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Agay-Ayan Multipurpose Cooperative Location"
                className="w-full h-full"
              ></iframe>
            </div>

            {/* Getting Here Card */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-start space-x-3">
                <div className="bg-green-600 rounded-full p-2 flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-green-900 mb-2">Getting Here</h4>
                  <p className="text-sm text-gray-700">
                    The cooperative office is located in Barangay Agay-Ayan, Gingoog City, Misamis Oriental. 
                    Accessible via public transportation from Gingoog City center. Tricycles and motorcycles 
                    are available for hire.
                  </p>
                </div>
              </div>
            </div>

            {/* Alternative: Direct Links */}
            <div className="mt-6 flex gap-3">
              <a 
                href="https://www.google.com/maps/dir//Agay-ayan,+Gingoog+City,+Misamis+Oriental"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors text-center text-sm font-semibold"
              >
                Get Directions
              </a>
              <a 
                href="https://www.google.com/maps/search/?api=1&query=Agay-ayan,Gingoog+City,Misamis+Oriental"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-white border-2 border-green-600 text-green-600 px-4 py-3 rounded-lg hover:bg-green-50 transition-colors text-center text-sm font-semibold"
              >
                View on Maps
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};




const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand Column */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <img src="/LOGO.png" alt="Agay-ayan MPC Logo" className="w-12 h-12 object-contain" />
              <div>
                <h3 className="font-bold text-lg">Agay-ayan Multi-Purpose Cooperative</h3>
                <p className="text-xs text-gray-400">EST. 30+ YEARS</p>
              </div>
            </div>
            <p className="text-gray-400 mb-4">
              A community-based cooperative supporting farmers, workers, and families through 
              financial services, agricultural production, and community development.
            </p>
            <div className="text-sm text-gray-400">
              <p>Agay-Ayan, Gingoog City, Misamis Oriental</p>
              <p>+63 XXX XXX XXXX</p>
              <p>info@agayayanmpc.coop</p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-lg mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a href="#home" className="text-gray-400 hover:text-green-400 transition-colors">Home</a>
              </li>
              <li>
                <a href="#about" className="text-gray-400 hover:text-green-400 transition-colors">About</a>
              </li>
              <li>
                <a href="#products" className="text-gray-400 hover:text-green-400 transition-colors">Products</a>
              </li>
              <li>
                <a href="#services" className="text-gray-400 hover:text-green-400 transition-colors">Services</a>
              </li>
              <li>
                <a href="#membership" className="text-gray-400 hover:text-green-400 transition-colors">Membership</a>
              </li>
              <li>
                <a href="#contact" className="text-gray-400 hover:text-green-400 transition-colors">Contact</a>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-bold text-lg mb-4">Our Services</h4>
            <ul className="space-y-2">
              <li className="text-gray-400">Savings Accounts</li>
              <li className="text-gray-400">Time Deposits</li>
              <li className="text-gray-400">Loan Programs</li>
              <li className="text-gray-400">Coconut Sugar Production</li>
              <li className="text-gray-400">Barangay Food Terminal</li>
              <li className="text-gray-400">Agricultural Marketing</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-sm text-gray-400">
              © 2026 Agay-Ayan Multi-Purpose Cooperative. All Rights Reserved.
            </div>
            <div className="flex space-x-6 text-sm text-gray-400">
              <a href="#" className="hover:text-green-400 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-green-400 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-green-400 transition-colors">Cooperative Policies</a>
            </div>
          </div>
          <div className="text-center mt-4 text-xs text-gray-500">
            Powered by AMCOMS - Agay-Ayan Multipurpose Cooperative Operations Management System
          </div>
        </div>
      </div>
    </footer>
  );
};



function LandingPage() {
  return (
    <div className="amcoms-landing min-h-screen">
      <Navbar />
      <Hero />
      <About />
      <Products />
      <Services />
      <Membership />
      <Reviews />
      <Contact />
      <Footer />
    </div>
  );
}

export default LandingPage;
