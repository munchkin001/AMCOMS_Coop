import React, { useState } from 'react';

const SMSCenter = () => {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');

  const handleSendSMS = () => {
    if (!recipient || !message) {
      alert('Please fill in all fields');
      return;
    }
    alert('SMS sent successfully!');
    setRecipient('');
    setMessage('');
  };

  return (
    <div className="space-y-6">
      {/* SMS Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">SMS Remaining</p>
              <p className="text-3xl font-bold text-blue-600">1,250</p>
            </div>
            <span className="text-3xl">📱</span>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Sent Today</p>
              <p className="text-3xl font-bold text-green-600">45</p>
            </div>
            <span className="text-3xl">✅</span>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Failed</p>
              <p className="text-3xl font-bold text-red-600">2</p>
            </div>
            <span className="text-3xl">❌</span>
          </div>
        </div>
      </div>

      {/* Send SMS Form */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Send SMS</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recipient *</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Enter member name or select from list"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Message *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              {message.length}/160 characters
            </p>
          </div>
          <button
            onClick={handleSendSMS}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Send SMS
          </button>
        </div>
      </div>

      {/* Quick Templates */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { name: 'Loan Due Reminder', message: 'Your loan payment of ₱X is due on [DATE].' },
            { name: 'Meeting Reminder', message: 'Reminder: General Meeting on [DATE] at [TIME].' },
            { name: 'Payment Received', message: 'We have received your payment of ₱X. Thank you!' },
            { name: 'Time Deposit Maturity', message: 'Your time deposit will mature on [DATE].' }
          ].map((template, idx) => (
            <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
              <p className="text-sm font-semibold text-gray-900 mb-2">{template.name}</p>
              <p className="text-xs text-gray-600">{template.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SMS History */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent SMS</h3>
        <div className="space-y-3">
          {[
            { recipient: 'Juan Dela Cruz', message: 'Your loan payment of ₱2,500 is due on June 10, 2026.', time: '10:30 AM', status: 'sent' },
            { recipient: 'Maria Santos', message: 'Reminder: General Meeting on June 15 at 2:00 PM.', time: '09:15 AM', status: 'sent' },
            { recipient: 'Pedro Reyes', message: 'We have received your payment of ₱5,000. Thank you!', time: 'Yesterday', status: 'sent' }
          ].map((sms, idx) => (
            <div key={idx} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{sms.recipient}</p>
                <p className="text-xs text-gray-600 mt-1">{sms.message}</p>
                <p className="text-xs text-gray-500 mt-1">{sms.time}</p>
              </div>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold">
                {sms.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SMSCenter;
