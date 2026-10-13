import React from 'react';

const ForgotPassword = () => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
      <h1 className="mb-3 text-center text-2xl font-bold text-gray-900">Password help</h1>
      <p className="mb-6 text-center text-gray-600">
        Password resets are handled in person by an authorized cooperative officer. Members should visit the Bookkeeper with identification.
      </p>
      <a
        href="/login/member"
        className="block rounded-lg bg-blue-800 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-900"
      >
        Back to Login
      </a>
    </div>
  </div>
);

export default ForgotPassword;
