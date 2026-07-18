"use client";
import React from "react";
import { FaFacebook, FaTwitter, FaInstagram, FaLinkedin } from "react-icons/fa";
const Userprofile = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">User Profile</h1>
          <p className="text-slate-600 text-sm mt-1">
            Manage your account settings and preferences
          </p>
        </div>
        <div>
          <button className="bg-blue-500 hover:bg-blue-600 transition px-5 py-2 rounded-lg text-white shadow">
            Edit Profile
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="pb-6">
          <h1 className="font-semibold text-slate-900 text-xl">
            Personal Information
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
              JD
            </div>
            <div className="absolute bottom-0 right-0 bg-green-500 w-4 h-4 rounded-full border-2 border-white"></div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900">John Doe</h2>
            <p className="text-slate-500 text-sm">john.doe@example.com</p>
            <p className="text-slate-500 text-xs">Member since 2022</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-slate-500 text-xs">First Name</p>
            <p className="text-slate-900 font-medium">John</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs">Last Name</p>
            <p className="text-slate-900 font-medium">Doe</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs">Email</p>
            <p className="text-slate-900 font-medium">[EMAIL_ADDRESS]</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs">Phone</p>
            <p className="text-slate-900 font-medium">1234567890</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs">Language</p>
            <p className="text-slate-900 font-medium">English</p>
          </div>
          <div>
            <p className="pb-2 text-slate-500 text-xs">Account Link</p>
            <div className="flex gap-4 items-center cursor-pointer">
              {/* Facebook */}
              <div className="h-10 w-10 rounded-full bg-[#1877F2] flex items-center justify-center text-white text-xl shadow-lg hover:scale-110 transition-all duration-300 cursor-pointer">
                <FaFacebook />
              </div>

              {/* Twitter */}
              <div className="h-10 w-10 rounded-full bg-[#1DA1F2] flex items-center justify-center text-white text-xl shadow-lg hover:scale-110 transition-all duration-300 cursor-pointer">
                <FaTwitter />
              </div>

              {/* Instagram */}
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-lg hover:scale-110 transition-all duration-300 cursor-pointer">
                <FaInstagram />
              </div>

              {/* LinkedIn */}
              <div className="h-10 w-10 rounded-full bg-[#0A66C2] flex items-center justify-center text-white text-xl shadow-lg hover:scale-110 transition-all duration-300 cursor-pointer">
                <FaLinkedin />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Address</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-slate-500 text-xs">Country</p>
            <p className="text-slate-900 font-medium">USA</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs">City / State</p>
            <p className="text-slate-900 font-medium">California</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs">Postal Code</p>
            <p className="text-slate-900 font-medium">57102</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs">Address</p>
            <p className="text-slate-900 font-medium">123 Main St</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Userprofile;
