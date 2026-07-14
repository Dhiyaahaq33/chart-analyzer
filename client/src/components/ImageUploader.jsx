import { useRef, useState } from 'react';

export default function ImageUploader({ onFile, accent }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  function handleFiles(files) {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) onFile(file);
  }

  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      style={{
        border: `2px dashed ${dragging ? accent : 'var(--border)'}`,
        borderRadius: '10px',
        padding: '36px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? `${accent}08` : 'transparent',
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>Drop a chart screenshot here</div>
      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>or click to browse — PNG, JPG, WEBP</div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  );
}
