import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { BadgeDollarSign, Check, ChevronDown, ClipboardList, IdCard, Sprout, Store } from 'lucide-react';
import CooperativeMap from './CooperativeMap';
import './landingpage.css';


const aboutLinks = [
  { id: 'core-identity', label: 'Core Identity' },
  { id: 'accreditations', label: 'Accreditations & Partnerships' }
];

const navLinks = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About', children: aboutLinks },
  { id: 'products', label: 'Products' },
  { id: 'services', label: 'Services' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'membership', label: 'Membership' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'contact', label: 'Contact' }
];

const activeLinkStyle = { color: '#ca8a04', fontWeight: 700, textShadow: '0 0 12px rgba(250, 204, 21, 0.55)' };

const useActiveSection = () => {
  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => {
    const update = () => {
      const marker = 120;
      let current = navLinks[0].id;
      navLinks.forEach(({ id }) => {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= marker) current = id;
      });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = navLinks[navLinks.length - 1].id;
      }
      setActiveSection(current);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return activeSection;
};

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeSection = useActiveSection();

  return (
    <nav aria-label="Main navigation" className="amcoms-navbar bg-white shadow-sm fixed w-full top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20 gap-6 xl:gap-10">
          {/* Logo and Brand */}
          <Link to="/" className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-shrink-0">
            <img src="/LOGO.png" alt="Agay-ayan MPC Logo" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
            <div>
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 leading-tight"><span className="block whitespace-nowrap">Agay-Ayan</span><span className="block whitespace-nowrap">Multi-Purpose Cooperative</span></h1>
              <p className="text-xs text-gray-500 hidden sm:block">EST. 30+ YEARS</p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center space-x-4 xl:space-x-8 flex-shrink-0">
            {navLinks.map(({ id, label, children }) => {
              const linkClass = 'whitespace-nowrap text-gray-700 hover:text-green-700 font-medium text-sm xl:text-base border-b-2 border-transparent pb-1 transition-colors';
              if (!children) {
                return (
                  <a key={id} href={`#${id}`} style={activeSection === id ? activeLinkStyle : undefined} className={linkClass} aria-current={activeSection === id ? 'true' : undefined}>{label}</a>
                );
              }
              return (
                <div key={id} className="relative group">
                  <a href={`#${id}`} style={activeSection === id ? activeLinkStyle : undefined} className={`${linkClass} inline-flex items-center gap-1`} aria-haspopup="true" aria-current={activeSection === id ? 'true' : undefined}>
                    {label}
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  </a>
                  <div className="absolute left-0 top-full pt-3 hidden group-hover:block group-focus-within:block">
                    <ul className="min-w-[15rem] bg-white rounded-lg shadow-lg border border-gray-100 py-2">
                      {children.map((child) => (
                        <li key={child.id}>
                          <a href={`#${child.id}`} className="block px-4 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 whitespace-nowrap">{child.label}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
            
            {/* Login Button */}
            <Link 
              to="/portal-selection"
              className="amcoms-login-btn whitespace-nowrap"
            >
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
              {navLinks.map(({ id, label, children }) => (
                <div key={id}>
                  <a href={`#${id}`} onClick={() => setIsMenuOpen(false)} style={activeSection === id ? activeLinkStyle : undefined} className="block text-gray-700 hover:text-green-700 font-medium py-2 px-4 hover:bg-gray-50 rounded" aria-current={activeSection === id ? 'true' : undefined}>{label}</a>
                  {children && (
                    <ul className="ml-4 border-l border-gray-200">
                      {children.map((child) => (
                        <li key={child.id}>
                          <a href={`#${child.id}`} onClick={() => setIsMenuOpen(false)} className="block text-sm text-gray-600 hover:text-green-700 py-2 px-4 hover:bg-gray-50 rounded">{child.label}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              
              {/* Mobile Login Button */}
              <Link 
                to="/portal-selection"
                onClick={() => setIsMenuOpen(false)}
                className="amcoms-login-btn amcoms-login-btn--block"
              >
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
            <div className="grid grid-cols-3 gap-3 sm:gap-6 md:gap-8">
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};




const Announcements = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, content, published_at')
        .eq('is_active', true)
        .contains('target_roles', ['public'])
        .order('published_at', { ascending: false })
        .limit(6);

      if (!active) return;
      if (error) console.error('Unable to load announcements:', error);
      setItems(data || []);
      setLoading(false);
    };

    load();
    const channel = supabase
      .channel('landing-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });
    const poll = setInterval(load, 30000);

    return () => {
      active = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <section id="announcements" className="py-12 sm:py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <span className="text-green-600 font-semibold text-xs sm:text-sm uppercase tracking-wide">Announcements</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900">Latest from the Cooperative</h2>
        </div>

        {loading ? (
          <p className="text-center text-gray-500 text-sm">Loading announcements...</p>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-500 text-sm">There are no announcements at this time.</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-4">
            {items.map((item) => (
              <article key={item.id} style={{ flex: '0 1 380px' }} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 text-center">
                <p className="text-xs font-medium text-green-700">
                  {new Date(item.published_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{item.content}</p>
              </article>
            ))}
          </div>
        )}
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
              Agay-ayan Multi-Purpose Cooperative Inc. is a community-based cooperative located in
              Barangay Agay-Ayan, Gingoog City, Misamis Oriental, Philippines. Established in 1992,
              it serves local coconut and agricultural farmers.
            </p>

            {/* Core Identity: Mission and Vision */}
            <div id="core-identity" className="scroll-mt-24">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3">Core Identity</h3>
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

            {/* Accreditations and Partnerships */}
            <div id="accreditations" className="scroll-mt-24 mt-6 sm:mt-8">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3">Accreditations &amp; Partnerships</h3>
              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                {[
                  'Accredited as a Civil Society Organization (CSO) by the Department of Agriculture Region 10 (DA-10).',
                  'Associated with the Philippine Rural Development Program (PRDP) and the Philippine Coconut Authority (PCA).',
                  'Received financial grant assistance through the DA Kadiwa ni Ani at Kita program.',
                ].map((text) => (
                  <div key={text} className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm sm:text-base text-gray-700">{text}</span>
                  </div>
                ))}
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
      </div>
    </section>
  );
};




const Services = () => {
  const services = [
    {
      icon: Sprout,
      title: 'Coconut Sugar Production',
      description: 'Known for producing organic coconut sugar.',
      bgColor: 'bg-green-50',
      iconBg: 'bg-green-100'
    },
    {
      icon: Store,
      title: 'Barangay Food Terminal (BFT)',
      description: 'Operates a local food terminal selling agricultural products, pork, and chicken.',
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-100'
    },
    {
      icon: BadgeDollarSign,
      title: 'Member Savings Operation (MSO)',
      description: 'Handles member savings and time deposits.',
      bgColor: 'bg-blue-50',
      iconBg: 'bg-blue-100'
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
          Comprehensive support for members and the community — from production to
          food access and member savings.
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
            href="https://www.google.com/maps/place/Agay-Ayan+Multi-Purpose+Cooperative/@8.8595116,125.0518517,17z/data=!4m8!3m7!1s0x33002f0986577b49:0xb2ca9ac866969672!8m2!3d8.8595116!4d125.0518517!9m1!1b1!16s%2Fg%2F1pzy89zxb" 
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
                    +63 951 047 8623 <br />
                    +63 916 686 3117
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
                    <a href="mailto:agay.ayanmpc@gmail.com" className="hover:text-green-700">agay.ayanmpc@gmail.com</a>
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
                <a href="https://www.facebook.com/AMCIsince1992/" target="_blank" rel="noopener noreferrer" aria-label="Agay-Ayan Multi-Purpose Cooperative on Facebook" className="bg-green-100 w-10 h-10 rounded-lg flex items-center justify-center hover:bg-green-200 transition-colors">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Google Map */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Our Location</h3>
            
            {/* Interactive map */}
            <div className="rounded-lg overflow-hidden shadow-lg mb-6 h-96" style={{ height: 384 }}>
              <CooperativeMap />
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
                href="https://www.google.com/maps/dir/?api=1&destination=8.8595116,125.0518517"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors text-center text-sm font-semibold"
              >
                Get Directions
              </a>
              <a 
                href="https://www.google.com/maps/search/?api=1&query=8.8595116,125.0518517"
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
              <p>+63 951 047 8623 <br />
                    +63 916 686 3117 </p>
              <p>agay.ayanmpc@gmail.com</p>
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
      <main>
        <Hero />
        <About />
        <Products />
        <Services />
        <Announcements />
        <Membership />
        <Reviews />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
