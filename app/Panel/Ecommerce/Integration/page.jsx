import React from "react";
import Intergrationcard from "@/PanelComponents/Intergration";
function Integration() {
  const intergrationdata = [
    {
      Image: "/amazonsvg.png",
      title: "Amazon",
      subtitle: "World’s largest marketplace. Millions of shoppers.",
    },
    {
      Image: "/shopify.png",
      title: "Shopify",
      subtitle: "Connect your Shopify store instantly",
    },
    {
      Image: "/ebay.png",
      title: "Ebay",
      subtitle: "Integrate your eBay store to unlock full control",
    },
    {
      Image: "/etsy.png",
      title: "Etsy",
      subtitle: "Unlock smarter selling by connecting your Etsy store",
    },
    {
      Image: "/walmart.jpg",
      title: "Walmart",
      subtitle: "Connect Walmart and scale your retail business effortlessly",
    },
  ];
  return (
    <div className="flex flex-col bg-slate-50 px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-xl font-semibold mt-2 text-slate-900">
        Connect a New Sales Channel
      </h1>
      <p className="text-slate-500 text-sm mt-3 mb-4">
        Choose a channel to integrate
      </p>
      <div className="border-b border-slate-200 w-full"></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-8">
        {intergrationdata.map((item) => (
          <Intergrationcard
            key={item.title}
            img={item.Image}
            title={item.title}
            subtitle={item.subtitle}
          />
        ))}
      </div>
    </div>
  );
}

export default Integration;
