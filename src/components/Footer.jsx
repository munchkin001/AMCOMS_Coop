import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-green-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <img src="/LOGO.png" alt="AMCOMS Logo" className="h-10 w-10 object-contain" />
              <span className="text-xl font-bold">AMCOMS</span>
            </div>
            <p className="text-green-200 leading-relaxed max-w-md">
              Agay-ayan Multi-Purpose Cooperative is dedicated to empowering our community
              through financial services, livelihood programs, and cooperative principles.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link to="/" className="text-green-200 hover:text-white transition-colors">Portal Selection</Link></li>
              <li><Link to="/staff/login" className="text-green-200 hover:text-white transition-colors">Staff Portal</Link></li>
              <li><Link to="/member/login" className="text-green-200 hover:text-white transition-colors">Member Portal</Link></li>
              <li><Link to="/member/register" className="text-green-200 hover:text-white transition-colors">Become a Member</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact</h3>
            <ul className="space-y-2 text-green-200">
              <li>Agay-ayan, Gingoog City</li>
              <li>Misamis Oriental, Philippines</li>
              <li>info@agayayanmpc.coop</li>
              <li>+63 XXX XXX XXXX</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-green-800 mt-8 pt-8 text-center text-green-300">
          <p>&copy; {new Date().getFullYear()} Agay-ayan Multi-Purpose Cooperative. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
