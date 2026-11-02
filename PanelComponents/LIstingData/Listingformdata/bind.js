// Connects an input to the shared listing form state.
export function makeBinder(formData, setFormData, errors = {}) {
  return (field, { checkbox = false } = {}) => ({
    name: field,
    ...(checkbox
      ? { checked: Boolean(formData?.[field]) }
      : { value: formData?.[field] ?? "" }),
    onChange: (e) =>
      setFormData((prev) => ({
        ...prev,
        [field]: checkbox ? e.target.checked : e.target.value,
      })),
    "aria-invalid": errors[field] ? true : undefined,
  });
}
