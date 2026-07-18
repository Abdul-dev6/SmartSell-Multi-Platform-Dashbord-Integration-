"use client";

import { useState } from "react";

import GeneralInformation from "./GeneralInformation";
import Organization from "./Orginization";
import MediaUploader from "./CreateMediaUploader";
import Pricing from "./Pricing";
import Inventory from "./Inventory";
import Shipping from "./Shipping";
import Seo from "./Seo";
import ActionButtons from "./Actionbutton";

export default function CreateListingForm() {
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    // General
    title: "",
    description: "",
    vendor: "",
    productType: "",
    tags: "",

    // Organization
    status: "active",
    collection: "",
    category: "",
    salesChannel: "shopify",
    visibility: "online",

    // Media
    images: [],

    // Pricing
    price: "",
    comparePrice: "",
    cost: "",

    // Inventory
    sku: "",
    barcode: "",
    quantity: "",
    warehouse: "Main Warehouse",
    trackInventory: true,
    continueSelling: false,

    // Shipping
    physicalProduct: true,
    weight: "",
    length: "",
    width: "",
    height: "",
    country: "Pakistan",
    hsCode: "",

    // SEO
    seoTitle: "",
    seoDescription: "",
    handle: "",
  });

  // Cancel Button

  const handleCancel = () => {
    console.log("Cancel");
  };

  // Save Draft Button

  const handleSaveDraft = () => {
    console.log(formData);
  };

  // Publish Button

  const handlePublish = async () => {
    try {
      setLoading(true);

      console.log(formData);

      // Later
      // await axios.post("/api/shopify/products", formData);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left */}

      <div className="xl:col-span-2 space-y-6">
        <GeneralInformation formData={formData} setFormData={setFormData} />

        <MediaUploader formData={formData} setFormData={setFormData} />

        <Pricing formData={formData} setFormData={setFormData} />

        <Inventory formData={formData} setFormData={setFormData} />

        <Shipping formData={formData} setFormData={setFormData} />

        <Seo formData={formData} setFormData={setFormData} />

        <ActionButtons
          loading={loading}
          onCancel={handleCancel}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
        />
      </div>

      {/* Right */}

      <div className="space-y-6">
        <Organization formData={formData} setFormData={setFormData} />
      </div>
    </div>
  );
}
