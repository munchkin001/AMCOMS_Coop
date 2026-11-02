import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import useToast from '../../hooks/useToast';
import ToastContainer from '../common/ToastContainer';
import RichTextContent from '../common/RichTextContent';
import RichTextEditor from '../common/RichTextEditor';
import { richTextToPlainText, sanitizeRichTextHtml } from '../../lib/richText';

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

const announcementTemplates = [
  {
    subject: 'General Assembly Reminder',
    message: '<p>Dear Members,</p><p>This is a reminder that our General Assembly will be held on <strong>[date]</strong> at <strong>[time]</strong> at <strong>[venue]</strong>.</p><p>Please arrive on time and bring your membership identification. The meeting will cover cooperative updates, reports, and matters requiring member participation.</p><p>We look forward to seeing you.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Board Meeting Notice',
    message: '<p>Dear Board Members,</p><p>Please be informed that a board meeting is scheduled for <strong>[date]</strong> at <strong>[time]</strong> at <strong>[venue or meeting link]</strong>.</p><p>Agenda: <strong>[briefly list agenda items]</strong>. Please review any relevant materials in advance and confirm your attendance with the office.</p><p>Thank you,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Annual Membership Meeting',
    message: '<p>Dear Members,</p><p>You are invited to attend the Annual Membership Meeting on <strong>[date]</strong> at <strong>[time]</strong> at <strong>[venue]</strong>.</p><p>The meeting will include cooperative updates, annual reports, and an opportunity to raise questions and discuss member concerns. Please bring your membership identification and arrive a few minutes early for registration.</p><p>We value your participation.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Dividend Distribution Schedule',
    message: '<p>Dear Members,</p><p>Dividend distribution is scheduled to begin on <strong>[start date]</strong> and will be available until <strong>[end date]</strong> at <strong>[office or distribution location]</strong>.</p><p>Please bring a valid membership identification. For your distribution date or eligibility details, contact the cooperative office at <strong>[contact information]</strong>.</p><p>Thank you for your continued support.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Membership Orientation',
    message: '<p>Dear Member,</p><p>We invite you to attend a membership orientation on <strong>[date]</strong> at <strong>[time]</strong> at <strong>[venue]</strong>.</p><p>The session will introduce the cooperative, explain member rights and responsibilities, and provide an overview of available services. Please confirm your attendance by <strong>[RSVP date/contact]</strong>.</p><p>We look forward to welcoming you.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Loan Program Announcement',
    message: '<p>Dear Members,</p><p>Information about the cooperative’s <strong>[loan program name]</strong> is now available. The program is intended for <strong>[brief eligibility summary]</strong> and applications may be submitted from <strong>[opening date]</strong> to <strong>[closing date]</strong>.</p><p>To review eligibility, requirements, rates, and repayment terms, please contact the cooperative office or visit <strong>[office/location]</strong>. Approval is subject to the cooperative’s policies and assessment process.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Training and Seminar Invitation',
    message: '<p>Dear Members and Staff,</p><p>You are invited to a <strong>[training/seminar topic]</strong> on <strong>[date]</strong> from <strong>[start time]</strong> to <strong>[end time]</strong> at <strong>[venue]</strong>.</p><p>The session will cover <strong>[brief description of topics]</strong>. Please confirm your attendance with <strong>[contact person or office]</strong> by <strong>[RSVP date]</strong>. Kindly arrive on time.</p><p>We hope you can join us.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Product Promotion',
    message: '<p>Dear Members,</p><p>We are pleased to share information about <strong>[product or service]</strong>, available from <strong>[start date]</strong> to <strong>[end date]</strong>.</p><p><strong>Offer details:</strong> [describe the offer, price, or applicable terms]. For availability and inquiries, please contact <strong>[contact information]</strong> or visit <strong>[location]</strong>.</p><p>Please review any eligibility requirements and terms before participating.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Office Closure Notice',
    message: '<p>Dear Members,</p><p>Please be advised that the cooperative office will be closed on <strong>[date(s)]</strong> due to <strong>[reason, if appropriate]</strong>.</p><p>Regular office hours will resume on <strong>[reopening date and time]</strong>. Please plan your transactions accordingly. For urgent concerns during the closure, contact <strong>[approved contact details]</strong>.</p><p>We apologize for any inconvenience.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Emergency Advisory',
    message: '<p><strong>Important advisory for members and staff</strong></p><p>Due to <strong>[verified situation]</strong>, please follow this guidance: <strong>[official instruction or action to take]</strong>.</p><p>Updates will be shared through <strong>[official communication channel]</strong>. For assistance, contact <strong>[verified emergency or office contact]</strong>. Please rely on official cooperative updates and avoid sharing unverified information.</p><p>Please take care and follow guidance from the appropriate authorities.</p><p>Agay-ayan Multi-Purpose Cooperative</p>'
  },
  {
    subject: 'Holiday Schedule',
    message: '<p>Dear Members,</p><p>Please note the cooperative’s holiday operating schedule: the office will be <strong>[open/closed]</strong> on <strong>[date(s)]</strong>.</p><p>Regular business hours will resume on <strong>[date and time]</strong>. Kindly complete time-sensitive transactions before the holiday schedule begins. For questions, contact <strong>[office contact information]</strong>.</p><p>We wish you a safe and pleasant holiday.</p><p>Regards,<br>Agay-ayan Multi-Purpose Cooperative</p>'
  }
];

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
  const { toasts, removeToast, error: showError, warning, info } = useToast();

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
    loadAnnouncements();
  };

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
    const plainMessage = richTextToPlainText(message);
    if (!subject.trim() || !plainMessage) {
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
        const { data, error: smsError } = await supabase.functions.invoke('mocean-sms', {
          body: { action: 'send-group', groups, message: `${subject.trim()}\n\n${plainMessage}` }
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
      content: sanitizeRichTextHtml(message),
      target_roles: targetRoles,
      published_by: staff?.id || null
    });
    if (insertError) {
      console.error('Unable to publish announcement:', insertError);
      showError('The announcement could not be published. Please try again.');
      return;
    }

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
    setSubject(template.subject);
    setMessage(template.message);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold text-gray-900">Announcements</h3>
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
                <RichTextEditor
                  id="announcement-message"
                  value={message}
                  onChange={setMessage}
                  placeholder="Type your announcement..."
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
                {alsoSendViaSMS && (
                  <p className="ml-6 mt-1 text-xs text-gray-500">SMS supports plain text only; font, color, and other styling will be omitted.</p>
                )}
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
              {announcementTemplates.map((template) => (
                <button
                  key={template.subject}
                  onClick={() => handleTemplateClick(template)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <span className="block text-sm font-medium text-gray-800">{template.subject}</span>
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
                <RichTextContent content={announcement.message} className="mb-2 break-words text-sm text-gray-600" />
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
