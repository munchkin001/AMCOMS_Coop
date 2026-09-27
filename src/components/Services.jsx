import React from 'react';

const Services = () => {
  const services = [
    {
      icon: '💰',
      title: 'Savings Accounts',
      description: 'Members can safely deposit money while earning annual dividends and interest depending on cooperative policies.',
      bgColor: 'bg-green-50',
      iconBg: 'bg-green-100'
    },
    {
      icon: '⏰',
      title: 'Time Deposits',
      description: 'Higher earning savings with fixed maturity periods and guaranteed returns for disciplined savers.',
      bgColor: 'bg-blue-50',
      iconBg: 'bg-blue-100'
    },
    {
      icon: '🤝',
      title: 'Loan Services',
      description: 'Members may apply for various loan programs subject to cooperative approval and eligibility requirements.',
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-100'
    },
    {
      icon: '🌾',
      title: 'Coconut Sugar Production',
      description: 'The cooperative purchases coconut sap from local farmers and processes it into high-quality coconut sugar products.',
      bgColor: 'bg-green-50',
      iconBg: 'bg-green-100'
    },
    {
      icon: '🏪',
      title: 'Barangay Food Terminal',
      description: 'Affordable agricultural products and essential commodities sold to the community while supporting local farmers.',
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-100'
    },
    {
      icon: '📊',
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
                <span className="text-2xl sm:text-3xl">{service.icon}</span>
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
        <div className="mt-12 sm:mt-16 md:mt-20 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 sm:p-8 md:p-12">
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
              💡 Financial transactions are completed at the cooperative office.
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

export default Services;
