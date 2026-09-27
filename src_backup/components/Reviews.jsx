import React from 'react';

const Reviews = () => {
  const reviews = [
    {
      name: 'Juan Dela Cruz',
      role: 'Member since 2015',
      text: 'The cooperative has been a huge help to my family. The savings program is excellent and the staff is always ready to assist.',
      initials: 'JD',
    },
    {
      name: 'Maria Santos',
      role: 'Member since 2018',
      text: 'I was able to start my small business through the cooperative loan program. The interest rates are very reasonable and the process was easy.',
      initials: 'MS',
    },
    {
      name: 'Pedro Reyes',
      role: 'Member since 2020',
      text: 'Great cooperative! The dividends I receive every year make membership truly worthwhile. Highly recommended.',
      initials: 'PR',
    },
  ];

  return (
    <section id="reviews" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-green-600 font-semibold text-sm uppercase tracking-wider">Testimonials</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
            What Our Members Say
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-lg">
            Hear from our members about their experience with the cooperative.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {reviews.map((review, index) => (
            <div key={index} className="bg-white rounded-2xl shadow-lg p-8">
              {/* Stars */}
              <div className="flex space-x-1 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <p className="text-gray-600 mb-6 italic leading-relaxed">"{review.text}"</p>

              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {review.initials}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{review.name}</p>
                  <p className="text-sm text-gray-500">{review.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Reviews;
