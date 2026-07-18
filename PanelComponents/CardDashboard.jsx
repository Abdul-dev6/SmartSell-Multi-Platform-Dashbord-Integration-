"use client";
import React from "react";

const CardDashboard = (props) => {
  const Icon = props.icon; // Assign the icon component to a capitalized variable

  return (
    <>
    
      <div className="flex min-w-0 flex-col pt-2">
        <h1 className="text-sm sm:text-base font-medium text-slate-500 dark:text-slate-700">{props.title}</h1>
        <p className="pb-2 text-2xl font-semibold text-slate-900 dark:text-slate-800">$ {props.value}</p>
        <div className="flex items-center gap-2 text-[60%] sm:text-xs">
          <div className="flex items-center gap-1 bg-green-300/10 rounded-lg p-1">
            <Icon className="text-green-500" />
            <span className="text-green-500">{props.percentage}</span>
          </div>
          <span className="text-slate-400 truncate">{props.month}</span>
        </div>
      </div>
      <div className="flex py-4 px-4 bg-gradient-to-br from-indigo-500 to-sky-500 rounded-2xl shadow-lg shadow-indigo-500/20">
        <Icon className="text-2xl text-white" />
      </div>
    </>
  );
};

export default CardDashboard;
