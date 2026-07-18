import React from "react";
import { FaArrowTrendUp } from "react-icons/fa6";

function Activity() {
  const product = [
    {
      name: "MAC",
      price: "$100",
      sales: "100",
    },
    {
      name: "Dell",
      price: "$200",
      sales: "200",
    },
    {
      name: "HP",
      price: "$300",
      sales: "300",
    },
    {
      name: "Lenovo",
      price: "$400",
      sales: "400",
    },
    {
      name: "Asus",
      price: "$500",
      sales: "500",
    },
  ];
  return (
    <>
      <div className="flex flex-col">
        <div className="flex justify-between gap-4 p-4">
          <div className="flex flex-col">
            <h1 className="text-base font-semibold text-slate-800 dark:text-slate-700">
              Top Product
            </h1>
            <h3 className="text-slate-400 text-xs">Best performing products</h3>
          </div>
          <div>
            <a href="#" className="text-blue-500 text-sm">
              View all
            </a>
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent px-2 pb-2">
          {product.map((item, index) => (
            <div
              key={index}
              className="scroll-smooth flex justify-between items-center hover:bg-slate-500 dark:hover:bg-slate-400 dark:text-slate-700 rounded-xl p-4 m-2 border border-slate-200 dark:border-slate-200"
            >
              <div className="flex flex-col items-center">
                <h1 className="text-slate-800 dark:text-slate-700">{item.name}</h1>
                <p className="text-sm text-slate-800 dark:text-slate-700">
                  {item.price}
                </p>
              </div>
              <div className="flex gap-1 items-center">
                <FaArrowTrendUp className="text-green-500" />
                <p className="text-slate-800 dark:text-slate-700">{item.sales}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default Activity;
