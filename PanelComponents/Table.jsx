import React from "react";

const Table = () => {
  const data = [
    {
      orderId: "#123456",
      customer: "John Doe",
      product: "100",
      amount: "$10",
      status: "Cancelled",
      date: "2022-01-01",
    },
    {
      orderId: "#123456",
      customer: "Abdul",
      product: "200",
      amount: "$30",
      status: "Completed",
      date: "2022-01-01",
    },
    {
      orderId: "#123456",
      customer: "Qadeer",
      product: "300",
      amount: "$40",
      status: "Pending",
      date: "2022-01-01",
    },
    {
      orderId: "#123456",
      customer: "Qadeer",
      product: "300",
      amount: "$40",
      status: "Pending",
      date: "2022-01-01",
    },
    {
      orderId: "#123456",
      customer: "Qadeer",
      product: "300",
      amount: "$40",
      status: "Pending",
      date: "2022-01-01",
    },
  ];

  return (
    <>
      <div className="flex flex-col mb-4 pl-2">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-700">
          Recent Orders
        </h1>
        <p className="text-slate-400 text-sm">Latest customer orders</p>
      </div>

      {/* Scrollable Table */}
      <div className="max-h-64 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <table className="w-full min-w-[720px] text-left border-collapse">
          {/* Header */}
          <thead className="sticky top-0 bg-slate-300 rounded-lg  dark:bg-slate-800 border-b rounded-lg border-slate-200 dark:border-slate-700">
            <tr className="text-sm text-slate-600 dark:text-white">
              <th className="p-3">Order ID</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Product</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {data.map((order, index) => (
              <tr
                key={index}
                className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-400"
              >
                <td className="p-3">{order.orderId}</td>
                <td className="p-3">{order.customer}</td>
                <td className="p-3">{order.product}</td>
                <td className="p-3">{order.amount}</td>

                {/* Status */}
                <td className="p-3">
                  <span
                    className={`text-white text-xs px-2 py-1 rounded-full
                      ${
                        order.status === "Pending"
                          ? "bg-yellow-500"
                          : order.status === "Completed"
                            ? "bg-green-500"
                            : "bg-red-500"
                      }`}
                  >
                    {order.status}
                  </span>
                </td>

                <td className="p-3">{order.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default Table;
