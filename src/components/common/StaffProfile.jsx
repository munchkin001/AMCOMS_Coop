import React, { useState } from 'react';

const StaffProfile = ({ role = 'Staff', roleName = 'Staff Member', roleColor = 'purple' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: `${role} Name`,
    email: `${role.toLowerCase()}@amcoms.coop`,
    phone: '0912-345-6789',
    address: 'Agay-ayan, Tublay, Benguet'
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleSave = () => {
    setIsEditing(false);
    alert('Profile updated successfully!');
  };

  const handlePasswordChange = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match!');
      return;
    }
    alert('Password changed successfully!');
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900">Personal Information</h3>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-4 py-2 bg-${roleColor}-600 text-white rounded-lg hover:bg-${roleColor}-700 text-sm font-medium self-start sm:self-auto`}
          >
            {isEditing ? 'Cancel' : 'Edit Information'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <input
              type="text"
              value={roleName}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm lg:text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={!isEditing}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base ${
                isEditing ? 'bg-white' : 'bg-gray-50 text-gray-500'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={!isEditing}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base ${
                isEditing ? 'bg-white' : 'bg-gray-50 text-gray-500'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              disabled={!isEditing}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base ${
                isEditing ? 'bg-white' : 'bg-gray-50 text-gray-500'
              }`}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              disabled={!isEditing}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base ${
                isEditing ? 'bg-white' : 'bg-gray-50 text-gray-500'
              }`}
            />
          </div>
        </div>

        {isEditing && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              className={`px-6 py-2 bg-${roleColor}-600 text-white rounded-lg hover:bg-${roleColor}-700 font-medium text-sm lg:text-base`}
            >
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 lg:p-6">
        <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4 lg:mb-6">Change Password</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
            <input
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
            <input
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
            <input
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
              placeholder="Confirm new password"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handlePasswordChange}
              className={`px-6 py-2 bg-${roleColor}-600 text-white rounded-lg hover:bg-${roleColor}-700 font-medium text-sm lg:text-base`}
            >
              Update Password
            </button>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 lg:p-6">
        <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4 lg:mb-6">Notification Preferences</h3>
        
        <div className="space-y-3">
          <label className="flex items-center">
            <input type="checkbox" defaultChecked className="mr-3 w-4 h-4" />
            <span className="text-sm lg:text-base text-gray-700">Email notifications for important updates</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" defaultChecked className="mr-3 w-4 h-4" />
            <span className="text-sm lg:text-base text-gray-700">SMS alerts for critical activities</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="mr-3 w-4 h-4" />
            <span className="text-sm lg:text-base text-gray-700">Daily summary reports</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button className={`px-6 py-2 bg-${roleColor}-600 text-white rounded-lg hover:bg-${roleColor}-700 font-medium text-sm lg:text-base`}>
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffProfile;
