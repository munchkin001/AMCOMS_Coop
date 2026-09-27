import React from 'react';

const Products = () => {
  const products = [
    { name: 'Organic Turmeric', image: '/turmeric.jpg', description: 'High-quality organic turmeric sourced directly from our cooperative farms.' },
    { name: 'Refined Sugar', image: '/sugar.jpg', description: 'Premium refined sugar at affordable prices for all members.' },
    { name: 'Crunchy Delights', image: '/crunch.jpg', description: 'Delicious crunchy snacks made with locally sourced ingredients.' },
  ];

  return (
    <section id="products" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-green-600 font-semibold text-sm uppercase tracking-wider">Our Products</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
            Quality Products from Our Cooperative
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-lg">
            We offer a range of high-quality products sourced from our member farmers
            and produced through our cooperative programs.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {products.map((product, index) => (
            <div key={index} className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
              <img src={product.image} alt={product.name} className="w-full h-64 object-cover" />
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{product.name}</h3>
                <p className="text-gray-600">{product.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Products;
