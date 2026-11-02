"use client";

import React from "react";
function Integrationcard(props) {
  const handleClick = () => {
    if (props.onConnect) {
      props.onConnect();
    } else if (props.buttonurl && props.buttonurl !== "#") {
      window.location.href = props.buttonurl;
    }
  };

  return (
    <>
      <div className="flex relative flex-col w-full min-h-[22rem] border border-slate-200 bg-white rounded-2xl items-center shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 rounded-b-[60%]" />

        {/* logo section */}
        <div className="flex w-24 h-24 items-center justify-center mt-10 z-10">
          <div className="bg-white p-3 rounded-full shadow-lg border border-gray-100">
            <img src={props.img} alt="" className="w-16 h-16 object-contain" />
          </div>
        </div>

        {/* text */}
        <div className="text-center pt-8 px-4 z-10">
          <h2 className="text-lg font-semibold text-slate-900">
            {props.title}
          </h2>
          <p className="text-slate-500 text-sm mt-2 leading-snug">
            {props.subtitle}
          </p>
        </div>

        {/* button */}
        <div className="text-center z-10">
          <button
            onClick={handleClick}
            className="mt-8 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 hover:from-blue-600 hover:to-indigo-600 text-white px-6 py-2 rounded-full shadow-md hover:shadow-xl transition-all duration-300 active:scale-95"
          >
            Connect
          </button>

        </div>
      </div>
    </>
  );
}

export default Integrationcard;
