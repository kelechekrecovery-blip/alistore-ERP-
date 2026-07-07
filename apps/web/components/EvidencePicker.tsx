'use client';

export function EvidencePicker({
  files,
  onChange,
  label = 'Фото доказательства',
  hint = 'JPG/PNG, до 8 МБ каждое',
  max = 4,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  hint?: string;
  max?: number;
}) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#3A342E] bg-[#221E19] p-3">
      <label className="block cursor-pointer text-center">
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []).slice(0, max);
            onChange(picked);
            event.target.value = '';
          }}
        />
        <span className="block text-xl">📷</span>
        <span className="mt-1 block text-[13px] font-semibold text-lime">{label}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-[#6E645C]">{hint}</span>
      </label>
      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-[9px] bg-[#16130F] px-2.5 py-2">
              <span className="text-sm">🖼</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-[#D8CFC6]">{file.name}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="text-[11px] text-[#FF8A7A]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
