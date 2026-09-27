import React from 'react';

const MyProfile = () => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
        <p className="text-gray-900 font-medium">Juan Dela Cruz</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Member Number</label>
        <p className="text-gray-900 font-medium">M-00125</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <p className="text-gray-900 font-medium">juan@email.com</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <p className="text-gray-900 font-medium">0917 123 4567</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <p className="text-gray-900 font-medium">Agay-ayan, Gingoog City</p>
      </div>
    </div>
  );
};

export default MyProfile;
