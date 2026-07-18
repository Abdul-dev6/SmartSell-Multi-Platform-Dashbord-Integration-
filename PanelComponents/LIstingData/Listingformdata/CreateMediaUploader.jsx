"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ImagePlus, Trash2 } from "lucide-react";

export default function MediaUploader() {
  const [images, setImages] = useState([]);
  const fileInputRef = useRef(null);

  const handleFiles = (files) => {
    const selectedFiles = Array.from(files);

    const newImages = selectedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setImages((prev) => [...prev, ...newImages]);
  };

  const handleChange = (e) => {
    handleFiles(e.target.files);
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      {/* Header */}

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Product Media</h2>

        <p className="text-sm text-slate-500 mt-1">
          Upload product images for your Shopify listing.
        </p>
      </div>

      {/* Upload Area */}

      <div
        onClick={() => fileInputRef.current.click()}
        className="
          border-2
          border-dashed
          border-slate-300
          rounded-2xl
          p-12
          text-center
          cursor-pointer
          hover:border-indigo-500
          hover:bg-indigo-50
          transition-all
        "
      >
        <ImagePlus className="mx-auto text-indigo-600" size={50} />

        <h3 className="mt-4 font-semibold text-lg">Upload Images</h3>

        <p className="text-slate-500 mt-2">Drag & Drop or Click to Upload</p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept="image/*"
          onChange={handleChange}
        />
      </div>

      {/* Preview */}

      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5 mt-8">
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <Image
                src={image.preview}
                alt="preview"
                width={250}
                height={250}
                className="
                  w-full
                  h-40
                  object-cover
                  rounded-xl
                  border
                "
              />

              <button
                onClick={() => removeImage(index)}
                className="
                  absolute
                  top-2
                  right-2
                  bg-red-600
                  text-white
                  rounded-full
                  p-2
                  opacity-0
                  group-hover:opacity-100
                  transition
                "
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
