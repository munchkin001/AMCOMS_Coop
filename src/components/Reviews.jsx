import React from 'react';

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

export default Reviews;
