import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import useToast from '../../hooks/useToast';
import ToastContainer from '../common/ToastContainer';

const roleKeys = {
  allMembers: 'member',
  recentMembers: 'member',
  manager: 'manager',
  treasurer: 'treasurer',
  bookkeeper: 'bookkeeper',
  inventoryStaff: 'inventory'
};

const roleLabels = {
  member: 'All Members',
  manager: 'Manager',
  treasurer: 'Treasurer',
  bookkeeper: 'Bookkeeper',
  inventory: 'Inventory Staff'
};

const Announcements = () => {
  const { staff } = useAuth();
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
  const [sending, setSending] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementToDiscard, setAnnouncementToDiscard] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const { toasts, removeToast, success, error: showError, warning, info } = useToast();

  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, target_roles, published_at')
      .eq('is_active', true)
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Unable to load announcements:', error);
      showError('Published announcements could not be loaded.');
      return;
    }

    setAnnouncements((data || []).map((item) => ({
      id: item.id,
      subject: item.title,
      message: item.content,
      date: new Date(item.published_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
      recipients: (item.target_roles || []).filter((role) => role !== 'public').map((role) => roleLabels[role] || role)
    })));
  }, [showError]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useRealtimeSubscription('announcements', loadAnnouncements, null, [loadAnnouncements]);

  const handleDelete = async () => {
    if (!announcementToDiscard) return;
    setDiscarding(true);
    const { error: discardError } = await supabase
      .from('announcements')
      .update({ is_active: false })
      .eq('id', announcementToDiscard);
    setDiscarding(false);
    if (discardError) {
      console.error('Unable to discard announcement:', discardError);
      showError('The announcement could not be discarded. Please try again.');
      return;
    }
    setAnnouncementToDiscard(null);
    success('Announcement discarded.');
    loadAnnouncements();
  };

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

  const handlePublish = async () => {
    if (!subject.trim() || !message.trim()) {
      warning('Please fill in subject and message.');
      return;
    }
    if (getSelectedRecipientsCount() === 0) {
      warning('Please select at least one recipient.');
      return;
    }

    if (alsoSendViaSMS) {
      setSending(true);
      try {
        const groups = Object.entries(recipients).filter(([, selected]) => selected).map(([group]) => group);
        if (groups.length === 0) throw new Error('Select at least one member or staff group to send SMS.');
        const { data, error: smsError } = await supabase.functions.invoke('semaphore-sms', {
          body: { action: 'send-group', groups, message: `${subject.trim()}\n\n${message.trim()}` }
        });
        if (smsError) {
          let serverMessage;
          try {
            serverMessage = (await smsError.context?.clone?.().json())?.error;
          } catch {
            serverMessage = null;
          }
          throw new Error(serverMessage || 'SMS delivery failed. The announcement was not published.');
        }
        if (!data?.sent_count) throw new Error('No SMS recipients with valid mobile numbers were found.');
        const sentMessage = `${data.sent_count} SMS message(s) accepted${data.failed_count ? `; ${data.failed_count} failed` : ''}.`;
        if (data.failed_count) warning(sentMessage);
        else success(sentMessage);
      } catch (smsError) {
        showError(smsError.message || 'SMS delivery failed. The announcement was not published.');
        setSending(false);
        return;
      }
      setSending(false);
    }

    // 'public' makes every announcement visible on the landing page; it is not a listed recipient.
    const targetRoles = [...new Set([...Object.entries(recipients).filter(([, selected]) => selected).map(([key]) => roleKeys[key]), 'public'])];
    const { error: insertError } = await supabase.from('announcements').insert({
      title: subject.trim(),
      content: message.trim(),
      target_roles: targetRoles,
      published_by: staff?.id || null
    });
    if (insertError) {
      console.error('Unable to publish announcement:', insertError);
      showError('The announcement could not be published. Please try again.');
      return;
    }

    success('Announcement published successfully!');
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
    info('Announcement saved as draft.');
  };

  const handleTemplateClick = (template) => {
    setSubject(template);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
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
                  disabled={sending}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? 'Sending…' : 'Publish Announcement'}
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
                </div>
                <p className="text-sm text-gray-600 mb-2">{announcement.message}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>{announcement.date}</span>
                  <span>• Recipients: {announcement.recipients.join(', ')}</span>
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                <button onClick={() => setAnnouncementToDiscard(announcement.id)} className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {announcementToDiscard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-announcement-title"
            aria-describedby="discard-announcement-description"
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h4 id="discard-announcement-title" className="text-lg font-semibold text-gray-900">
              Discard announcement?
            </h4>
            <p id="discard-announcement-description" className="mt-2 text-sm text-gray-600">
              It will no longer appear for members or on the landing page.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAnnouncementToDiscard(null)}
                disabled={discarding}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={discarding}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {discarding ? 'Discarding…' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Announcements;
