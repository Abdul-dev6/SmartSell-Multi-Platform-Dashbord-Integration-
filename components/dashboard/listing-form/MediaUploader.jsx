"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ImagePlus, Trash2 } from "lucide-react";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Matches the server limit (requests to Vercel functions are capped near 4.5 MB).
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const NO_IMAGES = [];

// Images chosen here are kept in formData.images as { id, file, preview } and
// uploaded to Shopify by the form after the product is saved.
export default function MediaUploader({ formData, setFormData, existingImages = [] }) {
  const fileInputRef = useRef(null);
  const [rejected, setRejected] = useState([]);
  const images = formData?.images ?? NO_IMAGES;

  // Release preview URLs when the uploader goes away.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview)), []);

  const handleFiles = (fileList) => {
    const accepted = [];
    const problems = [];
    for (const file of Array.from(fileList || [])) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        problems.push(`${file.name}: only JPEG, PNG, WebP or GIF`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`${file.name}: larger than 4 MB`);
      } else {
        accepted.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          file,
          preview: URL.createObjectURL(file),
        });
      }
    }
    setRejected(problems);
    if (accepted.length) {
      setFormData((prev) => ({ ...prev, images: [...(prev.images || []), ...accepted] }));
    }
  };

  const removeImage = (id) => {
    const image = images.find((i) => i.id === id);
    if (image) URL.revokeObjectURL(image.preview);
    setFormData((prev) => ({ ...prev, images: (prev.images || []).filter((i) => i.id !== id) }));
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
          JPEG, PNG, WebP or GIF, up to 4 MB each. Images upload to Shopify after the product is saved.
        </p>
      </div>

      {existingImages.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-slate-700">In Shopify</p>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {existingImages.map((image) => (
              <Image
                key={image.url}
                src={image.url}
                alt={image.alt || "Product image"}
                width={160}
                height={160}
                className="h-28 w-full rounded-xl border object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload Area */}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="
          w-full
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
        <ImagePlus className="mx-auto text-indigo-600" size={50} aria-hidden="true" />

        <span className="mt-4 block font-semibold text-lg">Upload Images</span>

        <span className="text-slate-500 mt-2 block">Drag & Drop or Click to Upload</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {rejected.length > 0 && (
        <ul role="alert" className="mt-4 space-y-1 text-sm text-red-700">
          {rejected.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {/* Preview */}

      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5 mt-8">
          {images.map((image) => (
            <div key={image.id} className="relative group">
              <Image
                src={image.preview}
                alt={`Selected image ${image.file.name}`}
                width={250}
                height={250}
                unoptimized
                className="
                  w-full
                  h-40
                  object-cover
                  rounded-xl
                  border
                "
              />

              <button
                type="button"
                onClick={() => removeImage(image.id)}
                aria-label={`Remove ${image.file.name}`}
                className="
                  absolute
                  top-2
                  right-2
                  bg-red-600
                  text-white
                  rounded-full
                  p-2
                  opacity-80
                  group-hover:opacity-100
                  focus:opacity-100
                  transition
                "
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
