import React from 'react';

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
              <p>📍 Agay-Ayan, Gingoog City, Misamis Oriental</p>
              <p>📞 +63 XXX XXX XXXX</p>
              <p>✉️ info@agayayanmpc.coop</p>
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

export default Footer;
