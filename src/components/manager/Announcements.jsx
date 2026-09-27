import React, { useState } from 'react';

const Announcements = () => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState({
    allMembers: false,
    manager: false,
    treasurer: false,
    bookkeeper: false,
    inventoryStaff: false,
    recentMembers: false
  });
  const [alsoSendViaSMS, setAlsoSendViaSMS] = useState(false);

  const [announcements] = useState([
    {
      id: 1,
      subject: 'Annual General Assembly — August 10, 2026',
      message: 'All cooperative members are invited to attend the Annual General Meeting.',
      date: '2026-06-01',
      recipients: ['All Members', 'Manager'],
      status: 'Board Notice'
    }
  ]);

  const templates = [
    'General Assembly Reminder',
    'Board Meeting Notice',
    'Annual Membership Meeting',
    'Dividend Distribution Schedule',
    'Membership Orientation',
    'Loan Program Announcement',
    'Training and Seminar Invitation',
    'Product Promotion',
    'Office Closure Notice',
    'Emergency Advisory',
    'Holiday Schedule'
  ];

  const handleRecipientChange = (key) => {
    setRecipients({
      ...recipients,
      [key]: !recipients[key]
    });
  };

  const getSelectedRecipientsCount = () => {
    return Object.values(recipients).filter(Boolean).length;
  };

  const handlePublish = () => {
    if (!subject.trim() || !message.trim()) {
      alert('Please fill in subject and message');
      return;
    }
    if (getSelectedRecipientsCount() === 0) {
      alert('Please select at least one recipient');
      return;
    }
    alert('Announcement published successfully!');
    setSubject('');
    setMessage('');
    setRecipients({
      allMembers: false,
      manager: false,
      treasurer: false,
      bookkeeper: false,
      inventoryStaff: false,
      recentMembers: false
    });
    setAlsoSendViaSMS(false);
  };

  const handleSaveDraft = () => {
    alert('Announcement saved as draft');
  };

  const handleTemplateClick = (template) => {
    setSubject(template);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold text-gray-900">Announcements</h3>
        <p className="text-sm text-gray-600">Create and publish official cooperative announcements to members and staff</p>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Compose Announcement */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Compose Announcement</h4>
            
            <div className="space-y-4">
              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Announcement subject..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your announcement..."
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Recipients */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipients <span className="text-blue-600">({getSelectedRecipientsCount()} selected)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recipients.allMembers}
                      onChange={() => handleRecipientChange('allMembers')}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">All Members</span>
                  </label>

                  <label className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recipients.manager}
                      onChange={() => handleRecipientChange('manager')}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Manager</span>
                  </label>

                  <label className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recipients.treasurer}
                      onChange={() => handleRecipientChange('treasurer')}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Treasurer</span>
                  </label>

                  <label className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recipients.bookkeeper}
                      onChange={() => handleRecipientChange('bookkeeper')}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Bookkeeper</span>
                  </label>

                  <label className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recipients.inventoryStaff}
                      onChange={() => handleRecipientChange('inventoryStaff')}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Inventory Staff</span>
                  </label>

                  <label className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recipients.recentMembers}
                      onChange={() => handleRecipientChange('recentMembers')}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Recent Members (Newly Registered)</span>
                  </label>
                </div>
              </div>

              {/* Also send via SMS */}
              <div>
                <label className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoSendViaSMS}
                    onChange={(e) => setAlsoSendViaSMS(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Also send via SMS (Signature)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handlePublish}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Publish Announcement
                </button>
                <button
                  onClick={handleSaveDraft}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Save Draft
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Quick Templates */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Quick Templates</h4>
            <div className="space-y-2">
              {templates.map((template, idx) => (
                <button
                  key={idx}
                  onClick={() => handleTemplateClick(template)}
                  className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors text-sm text-gray-700 hover:text-blue-700"
                >
                  {template}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Published Announcements */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Published Announcements</h4>
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="flex items-start justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h5 className="font-semibold text-gray-900">{announcement.subject}</h5>
                  <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                    {announcement.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{announcement.message}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>📅 {announcement.date}</span>
                  <span>• Recipients: {announcement.recipients.join(', ')}</span>
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                <button className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700">
                  Edit
                </button>
                <button className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Announcements;
